// Шлюз межбанковского реестра Sabyr.
//
// Небольшой HTTP-сервис поверх официального Fabric Gateway SDK. Держит по одному соединению
// на банк (организацию Fabric) и подписывает транзакции удостоверением того банка, от имени
// которого пришёл запрос (заголовок X-Bank: A | B). Заодно отдаёт страницу «Обозреватель реестра»
// и поток событий чейнкода (Server-Sent Events).
package main

import (
	"context"
	"crypto/x509"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/hyperledger/fabric-gateway/pkg/client"
	"github.com/hyperledger/fabric-gateway/pkg/hash"
	"github.com/hyperledger/fabric-gateway/pkg/identity"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/status"
)

//go:embed explorer.html
var explorerHTML []byte

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

type bank struct {
	code, mspID string
	conn        *grpc.ClientConn
	gw          *client.Gateway
	contract    *client.Contract
	network     *client.Network
}

func firstFile(dir string) ([]byte, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if !e.IsDir() {
			return os.ReadFile(filepath.Join(dir, e.Name()))
		}
	}
	return nil, fmt.Errorf("в каталоге %s нет файлов", dir)
}

// connect открывает соединение Fabric Gateway для банка. Пути по умолчанию соответствуют test-network.
func connect(code string, org int, defaultPort string) (*bank, error) {
	crypto := env("CRYPTO_PATH", "/crypto")
	domain := fmt.Sprintf("org%d.example.com", org)
	prefix := "BANK_" + code + "_"
	mspID := env(prefix+"MSP", fmt.Sprintf("Org%dMSP", org))
	peerHost := env(prefix+"PEER_HOST", "peer0."+domain)
	endpoint := env(prefix+"PEER_ENDPOINT", peerHost+":"+defaultPort)
	orgDir := filepath.Join(crypto, "peerOrganizations", domain)
	userMSP := filepath.Join(orgDir, "users", "User1@"+domain, "msp")

	tlsPEM, err := os.ReadFile(filepath.Join(orgDir, "peers", "peer0."+domain, "tls", "ca.crt"))
	if err != nil {
		return nil, fmt.Errorf("TLS-сертификат пира: %w", err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(tlsPEM) {
		return nil, errors.New("не удалось разобрать TLS-сертификат пира")
	}
	conn, err := grpc.NewClient(endpoint, grpc.WithTransportCredentials(credentials.NewClientTLSFromCert(pool, peerHost)))
	if err != nil {
		return nil, err
	}
	certPEM, err := firstFile(filepath.Join(userMSP, "signcerts"))
	if err != nil {
		return nil, fmt.Errorf("сертификат пользователя: %w", err)
	}
	cert, err := identity.CertificateFromPEM(certPEM)
	if err != nil {
		return nil, err
	}
	id, err := identity.NewX509Identity(mspID, cert)
	if err != nil {
		return nil, err
	}
	keyPEM, err := firstFile(filepath.Join(userMSP, "keystore"))
	if err != nil {
		return nil, fmt.Errorf("ключ пользователя: %w", err)
	}
	key, err := identity.PrivateKeyFromPEM(keyPEM)
	if err != nil {
		return nil, err
	}
	sign, err := identity.NewPrivateKeySign(key)
	if err != nil {
		return nil, err
	}
	gw, err := client.Connect(id, client.WithSign(sign), client.WithHash(hash.SHA256), client.WithClientConnection(conn),
		client.WithEvaluateTimeout(5*time.Second), client.WithEndorseTimeout(15*time.Second),
		client.WithSubmitTimeout(5*time.Second), client.WithCommitStatusTimeout(30*time.Second))
	if err != nil {
		return nil, err
	}
	network := gw.GetNetwork(env("CHANNEL", "sabyr"))
	return &bank{code: code, mspID: mspID, conn: conn, gw: gw, network: network,
		contract: network.GetContract(env("CHAINCODE", "sabyr"))}, nil
}

// --------------------------------------------------------------------------- события для обозревателя

type ledgerEvent struct {
	Block   uint64          `json:"block"`
	TxID    string          `json:"txId"`
	Name    string          `json:"name"`
	Payload json.RawMessage `json:"payload"`
}

type hub struct {
	mu      sync.Mutex
	history []ledgerEvent
	subs    map[chan ledgerEvent]struct{}
}

func (h *hub) publish(ev ledgerEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.history = append(h.history, ev)
	if len(h.history) > 2000 {
		h.history = h.history[len(h.history)-2000:]
	}
	for ch := range h.subs {
		select {
		case ch <- ev:
		default: // медленный подписчик не должен тормозить остальных
		}
	}
}

func (h *hub) subscribe() (chan ledgerEvent, []ledgerEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	ch := make(chan ledgerEvent, 256)
	h.subs[ch] = struct{}{}
	return ch, append([]ledgerEvent(nil), h.history...)
}

func (h *hub) unsubscribe(ch chan ledgerEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.subs, ch)
}

// listen читает события чейнкода с начала цепочки и переподключается при обрыве.
func (h *hub) listen(ctx context.Context, b *bank) {
	next := uint64(0)
	for ctx.Err() == nil {
		events, err := b.network.ChaincodeEvents(ctx, env("CHAINCODE", "sabyr"), client.WithStartBlock(next))
		if err != nil {
			log.Printf("подписка на события не удалась: %v", err)
			time.Sleep(3 * time.Second)
			continue
		}
		for ev := range events {
			h.publish(ledgerEvent{Block: ev.BlockNumber, TxID: ev.TransactionID, Name: ev.EventName, Payload: ev.Payload})
			next = ev.BlockNumber + 1
		}
		time.Sleep(time.Second)
	}
}

// --------------------------------------------------------------------------- HTTP

type server struct {
	banks map[string]*bank
	hub   *hub
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func fabricError(err error) string {
	msg := err.Error()
	for _, d := range status.Convert(err).Details() {
		msg += fmt.Sprintf(" | %v", d)
	}
	var endorse *client.EndorseError
	if errors.As(err, &endorse) {
		msg = "endorse: " + msg
	}
	return msg
}

func (s *server) bankOf(w http.ResponseWriter, r *http.Request) *bank {
	b, ok := s.banks[strings.ToUpper(r.Header.Get("X-Bank"))]
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "заголовок X-Bank должен быть A или B"})
		return nil
	}
	return b
}

func (s *server) submit(w http.ResponseWriter, b *bank, name string, args ...string) {
	result, commit, err := b.contract.SubmitAsync(name, client.WithArguments(args...))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": fabricError(err)})
		return
	}
	st, err := commit.Status()
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": fabricError(err)})
		return
	}
	if !st.Successful {
		writeJSON(w, http.StatusConflict, map[string]string{"error": fmt.Sprintf("транзакция %s не прошла валидацию: %s", st.TransactionID, st.Code)})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"txId": st.TransactionID, "block": st.BlockNumber, "bankId": b.mspID,
		"result": json.RawMessage(result)})
}

func (s *server) flags(w http.ResponseWriter, r *http.Request) {
	b := s.bankOf(w, r)
	if b == nil {
		return
	}
	var in struct{ AccountHash, Reason string }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "некорректный JSON"})
		return
	}
	s.submit(w, b, "FlagAccount", in.AccountHash, in.Reason, b.mspID)
}

func (s *server) getFlags(w http.ResponseWriter, r *http.Request) {
	b := s.bankOf(w, r)
	if b == nil {
		return
	}
	out, err := b.contract.EvaluateTransaction("GetAccountFlags", r.PathValue("hash"))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": fabricError(err)})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"flags": json.RawMessage(out)})
}

func (s *server) warnings(w http.ResponseWriter, r *http.Request) {
	b := s.bankOf(w, r)
	if b == nil {
		return
	}
	var in struct{ TransferHash, WarningHash, ClientResponseHash, Timestamp string }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "некорректный JSON"})
		return
	}
	s.submit(w, b, "RecordWarning", in.TransferHash, in.WarningHash, in.ClientResponseHash, in.Timestamp)
}

func (s *server) getWarning(w http.ResponseWriter, r *http.Request) {
	b := s.bankOf(w, r)
	if b == nil {
		return
	}
	out, err := b.contract.EvaluateTransaction("GetWarning", r.PathValue("hash"))
	if err != nil {
		msg := fabricError(err)
		if strings.Contains(msg, "WARNING_NOT_FOUND") {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "записи нет в реестре"})
			return
		}
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": msg})
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write(out)
}

func (s *server) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming не поддерживается", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	ch, history := s.hub.subscribe()
	defer s.hub.unsubscribe(ch)
	send := func(ev ledgerEvent) {
		data, _ := json.Marshal(ev)
		fmt.Fprintf(w, "data: %s\n\n", data)
	}
	for _, ev := range history {
		send(ev)
	}
	fmt.Fprint(w, "event: ready\ndata: {}\n\n")
	flusher.Flush()
	ping := time.NewTicker(15 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case ev := <-ch:
			send(ev)
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
		}
		flusher.Flush()
	}
}

func main() {
	a, err := connect("A", 1, "7051")
	if err != nil {
		log.Fatalf("Банк А: %v", err)
	}
	b, err := connect("B", 2, "9051")
	if err != nil {
		log.Fatalf("Банк Б: %v", err)
	}
	defer a.conn.Close()
	defer b.conn.Close()

	s := &server{banks: map[string]*bank{"A": a, "B": b}, hub: &hub{subs: map[chan ledgerEvent]struct{}{}}}
	go s.hub.listen(context.Background(), a)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /flags", s.flags)
	mux.HandleFunc("GET /flags/{hash}", s.getFlags)
	mux.HandleFunc("POST /warnings", s.warnings)
	mux.HandleFunc("GET /warnings/{hash}", s.getWarning)
	mux.HandleFunc("GET /events", s.events)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "channel": env("CHANNEL", "sabyr"),
			"chaincode": env("CHAINCODE", "sabyr"), "banks": map[string]string{"A": a.mspID, "B": b.mspID}})
	})
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(explorerHTML)
	})
	addr := env("LISTEN", ":8090")
	log.Printf("шлюз реестра Sabyr слушает %s (канал %s, чейнкод %s)", addr, env("CHANNEL", "sabyr"), env("CHAINCODE", "sabyr"))
	log.Fatal(http.ListenAndServe(addr, mux))
}
