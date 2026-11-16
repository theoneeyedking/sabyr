package main

import (
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/v2/pkg/cid"
	"github.com/hyperledger/fabric-chaincode-go/v2/shim"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// --- минимальные заглушки Fabric: состояние в памяти, идентичность вызывающего, события ---

type fakeStub struct {
	shim.ChaincodeStubInterface
	state  map[string][]byte
	txID   string
	now    time.Time
	events []string
}

func (s *fakeStub) GetState(key string) ([]byte, error) { return s.state[key], nil }
func (s *fakeStub) PutState(key string, v []byte) error { s.state[key] = v; return nil }
func (s *fakeStub) GetTxID() string                     { return s.txID }
func (s *fakeStub) GetTxTimestamp() (*timestamppb.Timestamp, error) {
	return timestamppb.New(s.now), nil
}
func (s *fakeStub) SetEvent(name string, payload []byte) error {
	s.events = append(s.events, name+" "+string(payload))
	return nil
}

type fakeIdentity struct {
	cid.ClientIdentity
	msp string
}

func (i fakeIdentity) GetMSPID() (string, error)                      { return i.msp, nil }
func (i fakeIdentity) GetX509Certificate() (*x509.Certificate, error) { return nil, nil }

type fakeCtx struct {
	contractapi.TransactionContextInterface
	stub *fakeStub
	msp  string
}

func (c *fakeCtx) GetStub() shim.ChaincodeStubInterface  { return c.stub }
func (c *fakeCtx) GetClientIdentity() cid.ClientIdentity { return fakeIdentity{msp: c.msp} }

type world struct {
	stub *fakeStub
	n    int
}

func newWorld() *world {
	return &world{stub: &fakeStub{state: map[string][]byte{}, now: time.Date(2026, 11, 16, 9, 0, 0, 0, time.UTC)}}
}

// as возвращает контекст новой транзакции от имени организации.
func (w *world) as(msp string) *fakeCtx {
	w.n++
	w.stub.txID = fmt.Sprintf("tx%d", w.n)
	w.stub.now = w.stub.now.Add(time.Minute)
	return &fakeCtx{stub: w.stub, msp: msp}
}

func h(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

const (
	bankA = "Org1MSP"
	bankB = "Org2MSP"
)

func TestFlagAccountAndReadFromAnotherBank(t *testing.T) {
	w, c := newWorld(), &SabyrContract{}
	acc := h("KZ11SBA0000000007777")

	flags, err := c.GetAccountFlags(w.as(bankB), acc)
	if err != nil || len(flags) != 0 {
		t.Fatalf("у нового счёта не должно быть отметок: %v %v", flags, err)
	}
	flag, err := c.FlagAccount(w.as(bankA), acc, "safe_account", bankA)
	if err != nil {
		t.Fatal(err)
	}
	if flag.BankID != bankA || flag.Reason != "safe_account" || flag.TxID != "tx2" || flag.Timestamp != "2026-11-16T09:02:00Z" {
		t.Fatalf("неверная отметка: %+v", flag)
	}
	// Банк Б видит отметку Банка А
	flags, err = c.GetAccountFlags(w.as(bankB), acc)
	if err != nil || len(flags) != 1 || flags[0].BankID != bankA {
		t.Fatalf("Банк Б должен видеть отметку Банка А: %v %v", flags, err)
	}
	if len(w.stub.events) != 1 || !strings.HasPrefix(w.stub.events[0], EventAccountFlagged) {
		t.Fatalf("ожидалось событие AccountFlagged: %v", w.stub.events)
	}
}

func TestFlagAccountIsIdempotentPerBankAndReason(t *testing.T) {
	w, c := newWorld(), &SabyrContract{}
	acc := h("acc")
	for i := 0; i < 2; i++ {
		if _, err := c.FlagAccount(w.as(bankA), acc, "fake_shop", bankA); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := c.FlagAccount(w.as(bankB), acc, "fake_shop", bankB); err != nil {
		t.Fatal(err)
	}
	if _, err := c.FlagAccount(w.as(bankA), acc, "investment", bankA); err != nil {
		t.Fatal(err)
	}
	flags, _ := c.GetAccountFlags(w.as(bankA), acc)
	if len(flags) != 3 {
		t.Fatalf("ожидалось 3 отметки (A:fake_shop, B:fake_shop, A:investment), получено %d", len(flags))
	}
}

func TestBankCannotFlagOnBehalfOfAnotherBank(t *testing.T) {
	w, c := newWorld(), &SabyrContract{}
	if _, err := c.FlagAccount(w.as(bankB), h("acc"), "safe_account", bankA); err == nil {
		t.Fatal("Банк Б не должен ставить отметку от имени Банка А")
	}
	if len(w.stub.state) != 0 {
		t.Fatal("состояние не должно меняться при отказе")
	}
}

func TestOnlyHashesAndReasonCodesAreAccepted(t *testing.T) {
	w, c := newWorld(), &SabyrContract{}
	bad := []string{"KZ11SBA0000000007777", "", strings.Repeat("g", 64), strings.ToUpper(h("x")), h("x")[:63]}
	for _, v := range bad {
		if _, err := c.FlagAccount(w.as(bankA), v, "safe_account", bankA); err == nil {
			t.Fatalf("accountHash %q должен быть отклонён", v)
		}
		if _, err := c.GetAccountFlags(w.as(bankA), v); err == nil {
			t.Fatalf("GetAccountFlags(%q) должен вернуть ошибку", v)
		}
		if _, err := c.RecordWarning(w.as(bankA), v, h("w"), h("r"), "2026-11-16T09:00:00Z"); err == nil {
			t.Fatalf("transferHash %q должен быть отклонён", v)
		}
	}
	// свободный текст (в нём могут оказаться персональные данные) в причину не пропускается
	for _, reason := range []string{"Гульнара перевела 1 500 000", "safe account", "", strings.Repeat("a", 33)} {
		if _, err := c.FlagAccount(w.as(bankA), h("acc"), reason, bankA); err == nil {
			t.Fatalf("reason %q должен быть отклонён", reason)
		}
	}
	if _, err := c.RecordWarning(w.as(bankA), h("t"), h("w"), h("r"), "вчера"); err == nil {
		t.Fatal("timestamp не в RFC 3339 должен быть отклонён")
	}
	if len(w.stub.state) != 0 {
		t.Fatal("некорректные вызовы не должны ничего записывать")
	}
}

func TestRecordWarningLifecycle(t *testing.T) {
	w, c := newWorld(), &SabyrContract{}
	tr, warn := h("transfer-1"), h("warning-text")

	if _, err := c.GetWarning(w.as(bankA), tr); err == nil || !strings.Contains(err.Error(), "WARNING_NOT_FOUND") {
		t.Fatalf("ожидалась ошибка WARNING_NOT_FOUND, получено %v", err)
	}
	rec, err := c.RecordWarning(w.as(bankA), tr, warn, h("WARNING_SHOWN"), "2026-11-16T14:00:00+05:00")
	if err != nil || len(rec.Entries) != 1 || rec.BankID != bankA {
		t.Fatalf("первая запись: %+v %v", rec, err)
	}
	rec, err = c.RecordWarning(w.as(bankA), tr, warn, h("DECLINED_BY_TRUSTED_PERSON"), "2026-11-16T14:03:00+05:00")
	if err != nil || len(rec.Entries) != 2 {
		t.Fatalf("вторая запись: %+v %v", rec, err)
	}
	// повторная отправка того же ответа не создаёт дубль
	rec, _ = c.RecordWarning(w.as(bankA), tr, warn, h("DECLINED_BY_TRUSTED_PERSON"), "2026-11-16T14:03:00+05:00")
	if len(rec.Entries) != 2 {
		t.Fatalf("дубль ответа: %d записей", len(rec.Entries))
	}

	// любой банк-участник может прочитать запись для разбора спора
	got, err := c.GetWarning(w.as(bankB), tr)
	if err != nil {
		t.Fatal(err)
	}
	if got.WarningHash != warn || got.ClientResponseHash != h("DECLINED_BY_TRUSTED_PERSON") ||
		got.Timestamp != "2026-11-16T14:03:00+05:00" || got.Entries[0].ClientResponseHash != h("WARNING_SHOWN") {
		t.Fatalf("неверная запись: %+v", got)
	}
	if got.Entries[0].RecordedAt == "" || got.Entries[0].TxID == got.Entries[1].TxID {
		t.Fatalf("у каждой фиксации должны быть своё время реестра и txId: %+v", got.Entries)
	}
	if len(w.stub.events) != 2 {
		t.Fatalf("ожидалось 2 события WarningRecorded, получено %d", len(w.stub.events))
	}
}

func TestWarningCannotBeRewritten(t *testing.T) {
	w, c := newWorld(), &SabyrContract{}
	tr := h("transfer-2")
	if _, err := c.RecordWarning(w.as(bankA), tr, h("warning"), h("shown"), "2026-11-16T09:00:00Z"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.RecordWarning(w.as(bankA), tr, h("другой текст предупреждения"), h("confirmed"), "2026-11-16T09:05:00Z"); err == nil {
		t.Fatal("подмена текста предупреждения должна быть отклонена")
	}
	if _, err := c.RecordWarning(w.as(bankB), tr, h("warning"), h("confirmed"), "2026-11-16T09:05:00Z"); err == nil {
		t.Fatal("чужой банк не должен дописывать запись")
	}
	got, _ := c.GetWarning(w.as(bankA), tr)
	if len(got.Entries) != 1 {
		t.Fatalf("запись не должна была измениться: %+v", got)
	}
}
