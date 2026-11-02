# fifty5

New puzzles to solve on a physical IQ Puzzler Pro set. You solve on your own board, and the site shows the setup, hints, timer and solution.

Unofficial fan-made puzzles for IQ Puzzler Pro. Not affiliated with SmartGames.

## Features

- Five levels: Starter, Junior, Expert, Master and Wizard. Every puzzle has exactly one solution, proven by the solver.
- Hints that reveal one piece at a time.
- An optional timer, with your solves and best times saved in your browser.
- A puzzle of the day.
- A shareable link for every puzzle.

See [docs/spec.md](docs/spec.md) for the full design.

## Development

Needs Node 24 or newer.

```sh
npm install
npm run dev        # run the site locally
npm run test:core  # fast tests
npm test           # also proves every puzzle in the bank (a few minutes)
npm run build      # typecheck and build to dist/
npm run generate   # top up public/bank; existing puzzles are never changed
```

The first `npm run generate` lists every solution of the board, which takes about 5 minutes. The result is cached in `.cache/`.

## License

The code is [MIT licensed](LICENSE). That doesn't cover the IQ Puzzler Pro name or game, which belong to SmartGames.
