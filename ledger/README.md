# Межбанковский реестр Sabyr

Hyperledger Fabric на базе `fabric-samples/test-network`: две организации (Org1MSP — Банк А, Org2MSP — Банк Б),
канал `sabyr`, чейнкод `sabyr`.

```bash
./network/up.sh      # скачивает fabric-samples и бинарники (закреплённые версии), поднимает сеть, ставит чейнкод
./network/down.sh
cd chaincode/sabyr && go test ./...
```

| Функция чейнкода | Назначение |
|---|---|
| `FlagAccount(accountHash, reason, bankId)` | пометить счёт как дроп; `bankId` должен совпадать с MSP вызывающего |
| `GetAccountFlags(accountHash)` | отметки по счёту |
| `RecordWarning(transferHash, warningHash, clientResponseHash, timestamp)` | зафиксировать предупреждение и ответ клиента; запись дополняемая, текст предупреждения менять нельзя |
| `GetWarning(transferHash)` | запись для разбора спора |

В реестр принимаются только хэши SHA-256 (64 hex-символа) и код причины `[a-z0-9_]` — свободный текст чейнкод
отклоняет, чтобы в блокчейн не попали персональные данные.

`gateway/` — HTTP-сервис на Go с Fabric Gateway SDK: `POST /flags`, `GET /flags/{hash}`, `POST /warnings`,
`GET /warnings/{hash}` (банк задаётся заголовком `X-Bank: A|B`), `GET /events` (SSE) и страница
«Обозреватель реестра» на `/`. Запускается профилем `ledger` в `docker-compose.yml`.
