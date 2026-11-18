# Sabyr — команды для демо и разработки.
COMPOSE ?= docker compose
PY ?= .venv/bin/python

.PHONY: demo demo-reset demo-check up down seed ledger-up ledger-down test test-ml test-backend test-chaincode train openapi logs

demo: .env ledger-up ## Всё для демо одной командой
	$(COMPOSE) --profile ledger up -d --build
	$(MAKE) seed
	@echo ""
	@echo "Готово:"
	@echo "  API и Swagger          http://localhost:8000/api/docs"
	@echo "  Обозреватель реестра   http://localhost:8090"
	@echo "  Мобильное приложение   cd mobile && npm install && npx expo start"

demo-reset: .env ## Чистый лист для повторного показа: новый реестр Fabric и свежие данные
	$(COMPOSE) --profile ledger stop ledger-gateway
	./ledger/network/down.sh
	./ledger/network/up.sh
	$(COMPOSE) --profile ledger up -d --force-recreate ledger-gateway
	$(MAKE) seed

demo-check: ## Сценарий демо по HTTP против запущенного стенда
	$(PY) scripts/demo_check.py

up: .env ## Только БД и backend (без реестра)
	$(COMPOSE) up -d --build

seed: ## Данные демо-сценария (Гульнара, Данияр, Айдос, дроп-счёт)
	$(COMPOSE) exec -T backend python manage.py seed_demo

ledger-up: ## Сеть Fabric: 2 организации, канал и чейнкод sabyr
	./ledger/network/up.sh

ledger-down:
	./ledger/network/down.sh

down: ## Остановить всё
	$(COMPOSE) --profile ledger --profile own-llm down -v
	./ledger/network/down.sh

.env:
	cp .env.example .env
	@echo "Создан .env из .env.example — поменяйте пароли и добавьте LLM_API_KEY"

test: test-ml test-backend test-chaincode ## Все тесты

test-ml:
	cd ml && ../$(PY) -m pytest -q

test-backend: ## Нужен PostgreSQL (docker compose up -d db) и DATABASE_URL с хостом localhost
	cd backend && ../$(PY) -m pytest -q

test-chaincode:
	cd ledger/chaincode/sabyr && go test ./...

train: ## Сгенерировать синтетику и обучить модель риска
	$(PY) -m sabyr_ml.datagen --out ml/data
	rm -f ml/data/frame.parquet
	$(PY) -m sabyr_ml.train

refresh-graph: ## Пересчитать графовые признаки (можно по расписанию)
	$(COMPOSE) exec -T backend python manage.py refresh_graph

openapi:
	cd backend && ../$(PY) manage.py spectacular --file ../docs/openapi.yaml

logs:
	$(COMPOSE) --profile ledger logs -f --tail 50
