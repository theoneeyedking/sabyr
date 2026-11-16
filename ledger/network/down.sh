#!/usr/bin/env bash
# Останавливает сеть Fabric и удаляет её данные.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -d "$HERE/fabric-samples/test-network" ] || { echo "Сеть не разворачивалась"; exit 0; }
cd "$HERE/fabric-samples/test-network" && ./network.sh down
