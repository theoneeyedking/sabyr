#!/usr/bin/env bash
# Поднимает межбанковский реестр Sabyr на базе Hyperledger Fabric test-network:
#   две организации (Org1MSP = Банк А, Org2MSP = Банк Б), один канал `sabyr`, чейнкод `sabyr`.
# Требуется: docker (compose v2), git, curl, jq, go >= 1.23.
set -euo pipefail

FABRIC_VERSION="${FABRIC_VERSION:-2.5.16}"
SAMPLES_COMMIT="${SAMPLES_COMMIT:-5789681b4f4d24e58fa40f19a69f5496892374b6}"
BINARIES_SHA256="18c91e7f2f11b601e6622cc70454d568af897707ee9adf111e9fa91a233881bf"   # linux-amd64, $FABRIC_VERSION=2.5.16
CHANNEL="${CHANNEL:-sabyr}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAMPLES="$HERE/fabric-samples"
CHAINCODE="$HERE/../chaincode/sabyr"

for tool in docker git curl jq go; do
  command -v "$tool" >/dev/null || { echo "Не найден $tool — он нужен для запуска реестра" >&2; exit 1; }
done

if [ ! -d "$SAMPLES/test-network" ]; then
  echo "==> Скачиваю fabric-samples ($SAMPLES_COMMIT)"
  git init -q "$SAMPLES"
  git -C "$SAMPLES" remote add origin https://github.com/hyperledger/fabric-samples.git
  git -C "$SAMPLES" fetch -q --depth 1 origin "$SAMPLES_COMMIT"
  git -C "$SAMPLES" checkout -q FETCH_HEAD
fi

if [ ! -x "$SAMPLES/bin/peer" ]; then
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"; arch="$(uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/')"
  url="https://github.com/hyperledger/fabric/releases/download/v${FABRIC_VERSION}/hyperledger-fabric-${os}-${arch}-${FABRIC_VERSION}.tar.gz"
  echo "==> Скачиваю бинарники Fabric $FABRIC_VERSION ($os-$arch)"
  mkdir -p "$HERE/_state"
  curl -fsSL -o "$HERE/_state/fabric.tgz" "$url"
  if [ "$os-$arch-$FABRIC_VERSION" = "linux-amd64-2.5.16" ]; then
    echo "$BINARIES_SHA256  $HERE/_state/fabric.tgz" | sha256sum -c - >/dev/null || { echo "Контрольная сумма архива Fabric не совпала" >&2; exit 1; }
  fi
  tar -xzf "$HERE/_state/fabric.tgz" -C "$SAMPLES"
fi

echo "==> Образы Fabric $FABRIC_VERSION"
for image in peer orderer ccenv baseos; do
  docker image inspect "hyperledger/fabric-$image:$FABRIC_VERSION" >/dev/null 2>&1 || docker pull -q "hyperledger/fabric-$image:$FABRIC_VERSION"
  docker tag "hyperledger/fabric-$image:$FABRIC_VERSION" "hyperledger/fabric-$image:latest"   # test-network ссылается на :latest
  docker tag "hyperledger/fabric-$image:$FABRIC_VERSION" "hyperledger/fabric-$image:${FABRIC_VERSION%.*}"
done

cd "$SAMPLES/test-network"
echo "==> Сеть: 2 организации, канал $CHANNEL"
./network.sh down >/dev/null 2>&1 || true
./network.sh up createChannel -c "$CHANNEL" 2>&1 | grep -E "Channel '.*' (created|joined)|Error|error|failed" || true
echo "==> Чейнкод sabyr"
GOTOOLCHAIN=local ./network.sh deployCC -c "$CHANNEL" -ccn sabyr -ccp "$CHAINCODE" -ccl go 2>&1 \
  | grep -E "Approvals|committed on channel|Error|error:|failed" | grep -v "is not defined" || true

docker ps --format '{{.Names}}' | grep -q '^dev-peer0.org1.example.com-sabyr' \
  || { echo "Чейнкод не запустился — смотрите вывод ./network.sh deployCC" >&2; exit 1; }
echo "Реестр готов: канал $CHANNEL, чейнкод sabyr, Банк А = Org1MSP, Банк Б = Org2MSP"
