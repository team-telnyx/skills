.PHONY: build typecheck test

build:
	bun run build

typecheck:
	bun run typecheck

test: build
	bun run test
