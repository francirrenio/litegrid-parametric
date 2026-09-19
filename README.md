# LiteGrid Parametric

Gerador paramétrico de organizadores modulares com gavetas para impressão FDM, com o mínimo de material que ainda deixe tudo rígido, seguro e usável. Roda 100% no navegador (TypeScript, sem servidor).

Você informa bico, largura, altura e profundidade do gabinete, divide em **seções** verticais com **filas** de gavetas, e o gerador monta:

- **Esqueleto** do gabinete em peças planas (impressas deitadas, com abas e ranhuras) ou gabinete monolítico.
- **Gavetas** com paredes fechadas, vazadas (triângulo, hexágono, losango, círculo) ou em treliça, com sugestões de reforço, puxadores, porta-etiqueta e divisórias.
- **Skins** opcionais (paredes externas) fechadas, vazadas ou de painel de fixação (Skadis, Pegboard, HSW), com espaçadores.
- **Fixações** entre gabinetes, na parede e no Skadis.
- **Exportação:** STL por peça, mesa (STL ou 3MF), ZIP completo, `layout_manifest.json`, perfil de fatiador e guia de montagem.

Sem estimativa de tempo nem de filamento: o produto são as peças prontas para imprimir. Veja a especificação completa em [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md).

## Desenvolvimento

```bash
npm install
npm run dev        # servidor local
npm test           # testes (vitest)
npm run typecheck  # tsc --noEmit
npm run build      # gera dist/ estático
```

## Publicação

O build é estático (`dist/`, caminhos relativos), então funciona em qualquer subcaminho.

- **GitHub Pages:** o workflow `.github/workflows/pages.yml` publica a cada push na `main`. Ative Pages em *Settings > Pages > Source: GitHub Actions*.
- **Cloudflare Pages:** comando de build `npm run build`, diretório de saída `dist`.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/core` | parâmetros derivados do bico, layout de seções, filas e vãos, manifesto |
| `src/geom` | núcleo de malhas (extrusões, transformações, análise) |
| `src/gen` | geradores: esqueleto, gavetas, skins, painéis, fixações, sugestões, padrões de vazado |
| `src/export` | STL, 3MF, ZIP, mesas, perfil de fatiador, guia de montagem |
| `src/model` | tipos e valores padrão do projeto |
| `src/ui` | interface web |
| `docs` | especificação e referências |

O projeto é salvo automaticamente no navegador (`localStorage`) e pode ser salvo e aberto como arquivo JSON.

---

## English

LiteGrid Parametric is a browser-only (TypeScript, no server) parametric generator of modular drawer organizers for FDM printing. Enter the nozzle and the cabinet width, height and depth, split it into sections with rows of drawers, and it builds the flat-pack frame (or a monolithic cabinet), drawers, optional skins and spacers, and fasteners. Export per-part STL, bed STL/3MF, a full ZIP, `layout_manifest.json`, a slicer profile and an assembly guide.

The interface is bilingual (Português / English): use the language selector in the header; the choice is remembered and the page reloads. Development commands are the same as above (`npm run dev`, `npm test`, `npm run typecheck`, `npm run build`).
