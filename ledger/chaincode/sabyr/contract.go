// Чейнкод межбанковского реестра Sabyr.
//
// В реестр пишутся только хэши (SHA-256 с солью, считаются на стороне банка) и служебные поля:
// код причины, MSP банка, время. Персональных данных в реестре нет.
package main

import (
	"encoding/json"
	"fmt"
	"regexp"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

const (
	flagPrefix    = "flag:"
	warningPrefix = "warning:"

	EventAccountFlagged  = "AccountFlagged"
	EventWarningRecorded = "WarningRecorded"
)

var (
	hashRe   = regexp.MustCompile(`^[0-9a-f]{64}$`)
	reasonRe = regexp.MustCompile(`^[a-z0-9_]{1,32}$`)
)

// AccountFlag — отметка «счёт используется мошенниками (дроп)».
type AccountFlag struct {
	AccountHash string `json:"accountHash"`
	Reason      string `json:"reason"`
	BankID      string `json:"bankId"`
	Timestamp   string `json:"timestamp"`
	TxID        string `json:"txId"`
}

// WarningEntry — одна фиксация ответа клиента на предупреждение.
type WarningEntry struct {
	ClientResponseHash string `json:"clientResponseHash"`
	Timestamp          string `json:"timestamp"`  // время на стороне банка (когда показали / когда клиент ответил)
	RecordedAt         string `json:"recordedAt"` // время транзакции в реестре
	TxID               string `json:"txId"`
}

// WarningRecord — доказательство для разбора спора: клиенту показали предупреждение и он ответил.
type WarningRecord struct {
	TransferHash       string         `json:"transferHash"`
	WarningHash        string         `json:"warningHash"`
	ClientResponseHash string         `json:"clientResponseHash"` // последний ответ
	Timestamp          string         `json:"timestamp"`          // время последнего ответа
	BankID             string         `json:"bankId"`
	Entries            []WarningEntry `json:"entries"`
}

// LedgerEvent — событие чейнкода для «Обозревателя реестра».
type LedgerEvent struct {
	Type               string `json:"type"`
	BankID             string `json:"bankId"`
	AccountHash        string `json:"accountHash,omitempty"`
	Reason             string `json:"reason,omitempty"`
	TransferHash       string `json:"transferHash,omitempty"`
	WarningHash        string `json:"warningHash,omitempty"`
	ClientResponseHash string `json:"clientResponseHash,omitempty"`
	Timestamp          string `json:"timestamp"`
	TxID               string `json:"txId"`
}

type SabyrContract struct {
	contractapi.Contract
}

func txTime(ctx contractapi.TransactionContextInterface) (string, error) {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return "", fmt.Errorf("не удалось получить время транзакции: %w", err)
	}
	return ts.AsTime().UTC().Format(time.RFC3339), nil
}

func callerMSP(ctx contractapi.TransactionContextInterface) (string, error) {
	msp, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return "", fmt.Errorf("не удалось определить банк вызывающего: %w", err)
	}
	return msp, nil
}

func emit(ctx contractapi.TransactionContextInterface, name string, ev LedgerEvent) error {
	payload, err := json.Marshal(ev)
	if err != nil {
		return err
	}
	return ctx.GetStub().SetEvent(name, payload)
}

// FlagAccount помечает счёт как дроп. bankId обязан совпадать с MSP вызывающего:
// банк может ставить отметки только от своего имени.
func (c *SabyrContract) FlagAccount(ctx contractapi.TransactionContextInterface, accountHash, reason, bankId string) (*AccountFlag, error) {
	if !hashRe.MatchString(accountHash) {
		return nil, fmt.Errorf("accountHash должен быть SHA-256 в hex (64 символа)")
	}
	if !reasonRe.MatchString(reason) {
		return nil, fmt.Errorf("reason должен быть кодом причины ([a-z0-9_], до 32 символов), а не свободным текстом")
	}
	msp, err := callerMSP(ctx)
	if err != nil {
		return nil, err
	}
	if bankId != msp {
		return nil, fmt.Errorf("bankId %q не совпадает с организацией вызывающего %q", bankId, msp)
	}
	flags, err := c.GetAccountFlags(ctx, accountHash)
	if err != nil {
		return nil, err
	}
	for i := range flags {
		if flags[i].BankID == bankId && flags[i].Reason == reason {
			return &flags[i], nil // повторная отметка того же банка по той же причине — без дубля
		}
	}
	ts, err := txTime(ctx)
	if err != nil {
		return nil, err
	}
	flag := AccountFlag{AccountHash: accountHash, Reason: reason, BankID: bankId, Timestamp: ts, TxID: ctx.GetStub().GetTxID()}
	data, err := json.Marshal(append(flags, flag))
	if err != nil {
		return nil, err
	}
	if err := ctx.GetStub().PutState(flagPrefix+accountHash, data); err != nil {
		return nil, err
	}
	return &flag, emit(ctx, EventAccountFlagged, LedgerEvent{Type: EventAccountFlagged, BankID: bankId,
		AccountHash: accountHash, Reason: reason, Timestamp: ts, TxID: flag.TxID})
}

// GetAccountFlags возвращает все отметки по счёту (пустой список, если их нет).
func (c *SabyrContract) GetAccountFlags(ctx contractapi.TransactionContextInterface, accountHash string) ([]AccountFlag, error) {
	if !hashRe.MatchString(accountHash) {
		return nil, fmt.Errorf("accountHash должен быть SHA-256 в hex (64 символа)")
	}
	data, err := ctx.GetStub().GetState(flagPrefix + accountHash)
	if err != nil {
		return nil, err
	}
	flags := []AccountFlag{}
	if data == nil {
		return flags, nil
	}
	return flags, json.Unmarshal(data, &flags)
}

// RecordWarning фиксирует, что клиенту показали предупреждение и что он ответил.
// Запись дополняемая: первый вызов создаёт её, следующие добавляют новые ответы
// (показано -> отклонено доверенным лицом и т.п.). Хэш предупреждения менять нельзя,
// дописывать может только банк, создавший запись.
func (c *SabyrContract) RecordWarning(ctx contractapi.TransactionContextInterface, transferHash, warningHash, clientResponseHash, timestamp string) (*WarningRecord, error) {
	for name, h := range map[string]string{"transferHash": transferHash, "warningHash": warningHash, "clientResponseHash": clientResponseHash} {
		if !hashRe.MatchString(h) {
			return nil, fmt.Errorf("%s должен быть SHA-256 в hex (64 символа)", name)
		}
	}
	if _, err := time.Parse(time.RFC3339, timestamp); err != nil {
		return nil, fmt.Errorf("timestamp должен быть в формате RFC 3339: %w", err)
	}
	msp, err := callerMSP(ctx)
	if err != nil {
		return nil, err
	}
	recordedAt, err := txTime(ctx)
	if err != nil {
		return nil, err
	}
	key := warningPrefix + transferHash
	data, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, err
	}
	rec := WarningRecord{TransferHash: transferHash, WarningHash: warningHash, BankID: msp, Entries: []WarningEntry{}}
	if data != nil {
		if err := json.Unmarshal(data, &rec); err != nil {
			return nil, err
		}
		if rec.BankID != msp {
			return nil, fmt.Errorf("запись создана другим банком (%s)", rec.BankID)
		}
		if rec.WarningHash != warningHash {
			return nil, fmt.Errorf("warningHash не совпадает с уже зафиксированным: текст предупреждения менять нельзя")
		}
		for _, e := range rec.Entries {
			if e.ClientResponseHash == clientResponseHash {
				return &rec, nil // идемпотентность при повторной отправке
			}
		}
	}
	txID := ctx.GetStub().GetTxID()
	rec.Entries = append(rec.Entries, WarningEntry{ClientResponseHash: clientResponseHash, Timestamp: timestamp, RecordedAt: recordedAt, TxID: txID})
	rec.ClientResponseHash, rec.Timestamp = clientResponseHash, timestamp
	out, err := json.Marshal(rec)
	if err != nil {
		return nil, err
	}
	if err := ctx.GetStub().PutState(key, out); err != nil {
		return nil, err
	}
	return &rec, emit(ctx, EventWarningRecorded, LedgerEvent{Type: EventWarningRecorded, BankID: msp, TransferHash: transferHash,
		WarningHash: warningHash, ClientResponseHash: clientResponseHash, Timestamp: timestamp, TxID: txID})
}

// GetWarning возвращает запись о предупреждении для разбора спора.
func (c *SabyrContract) GetWarning(ctx contractapi.TransactionContextInterface, transferHash string) (*WarningRecord, error) {
	if !hashRe.MatchString(transferHash) {
		return nil, fmt.Errorf("transferHash должен быть SHA-256 в hex (64 символа)")
	}
	data, err := ctx.GetStub().GetState(warningPrefix + transferHash)
	if err != nil {
		return nil, err
	}
	if data == nil {
		return nil, fmt.Errorf("WARNING_NOT_FOUND: записи о предупреждении для перевода %s нет", transferHash)
	}
	var rec WarningRecord
	return &rec, json.Unmarshal(data, &rec)
}
