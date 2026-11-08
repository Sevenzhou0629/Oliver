.PHONY: demo test
# In-memory demo is credential-free; persisted demo also runs migrations.
demo:
	npm install
	npm start
demo-db:
	docker compose up -d --wait
	npm install
	DATABASE_URL=postgres://cardpilot:localonly@localhost:5432/cardpilot npm run migrate
	DATABASE_URL=postgres://cardpilot:localonly@localhost:5432/cardpilot npm start
test:
	npm run typecheck
	npm test
