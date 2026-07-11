# VDF: Verifiable Delay Functions

Source for [vdf.foundation](https://vdf.foundation) — a plain-spoken, working
explanation of Verifiable Delay Functions (Boneh, Bonneau, Bünz, Fisch, CRYPTO
2018), aimed at engineers rather than cryptographers. Third site in the same
small network as [Pedersen Commitments](https://pedersen.foundation) and
[Garbled Circuits](https://garbled.foundation), reusing their design system
and Astro setup.

Every historical claim is sourced (see `/history` and `/further-reading`), and
every interactive demo computes real values client-side — nothing is mocked. See
`/about` for what this site is and how to contribute.

## Stack

- [Astro](https://astro.build) (static output, island architecture)
- Content in MDX (`src/pages/*.mdx`)
- [KaTeX](https://katex.org) for math, via `remark-math`/`rehype-katex`
- [Shiki](https://shiki.style) for code highlighting (Astro's default)
- The demo (repeated squaring, Wesolowski proof/verify, Miller-Rabin
  hash-to-prime) uses only native `BigInt` — no external crypto library, same
  ethos as Pedersen Commitments' classic mod-p demos — see `src/lib/`

## Development

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output to ./dist
npm run astro check
```

## Contributing

Corrections and additions are welcome — open an issue or a pull request. See
`/about` on the live site for more.

## License

Code is [MIT](LICENSE). Written content is [CC-BY 4.0](LICENSE-CONTENT.md).
