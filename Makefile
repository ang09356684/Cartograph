.PHONY: dev dev-attach dev-logs dev-stop build start lint typecheck install

SESSION := dev
# 啟動用 port；可在 command line 覆寫，例：`make dev PORT=3010`
PORT    ?= 3000

install:
	npm install

dev:
	@tmux kill-session -t $(SESSION) 2>/dev/null || true
	@tmux new-session -d -s $(SESSION) 'exec npx next dev -p $(PORT)'
	@echo ""
	@echo "  ▶ Dev server:  http://localhost:$(PORT)"
	@echo ""
	@echo "  tmux session: '$(SESSION)' (port $(PORT))"
	@echo "    Attach: make dev-attach"
	@echo "    Logs:   make dev-logs"
	@echo "    Stop:   make dev-stop"

dev-attach:
	@tmux attach -t $(SESSION)

dev-logs:
	@tmux capture-pane -t $(SESSION) -p | tail -40

dev-stop:
	@tmux kill-session -t $(SESSION) 2>/dev/null && echo "Stopped" || echo "No session"

build:
	npx next build

start:
	@echo ""
	@echo "  ▶ Prod server: http://localhost:$(PORT)"
	@echo ""
	npx next start -p $(PORT)

lint:
	npx next lint

typecheck:
	npx tsc --noEmit
