# Observabilidade → MCP OPS · fluxo animado

Versão animada (estilo *archify*) do diagrama de arquitetura em [`docs/referencia.jpg`](./docs/referencia.jpg):
Aplicações → Observabilidade → OTEL Collector → Repositórios → Monitoração + MCP OPS, com o MCP OPS
atuando de volta em todas as camadas. A faixa de resultados do rodapé da imagem original foi retirada.

Abra **`index.html`** direto no navegador. O arquivo é autocontido: fontes, ícones e logos estão embutidos,
então funciona offline, inclusive no projetor.

## O que acontece na tela

1. **Montagem (0–6,6 s)**: cada bloco é desenhado na ordem do fluxo, os conectores se ligam e o feedback do
   MCP OPS aparece.
2. **Ao vivo (loop contínuo de 10 s)**: pacotes de *logs*, *métricas* e *traces* saem das Aplicações,
   acendem Log4J / Biblioteca Padronizada / OpenTelemetry SDK, passam pelo OTEL Collector, chegam ao Loki e
   ao Dynatrace SaaS e se dividem entre a Monitoração (alerta no Grafana, notificação no WhatsApp e no Teams)
   e o MCP OPS (Agentes de IA → Insights e Diagnósticos → Automação → Recomendações). Em seguida o MCP OPS
   devolve ações a cada camada (réplicas, sampling, pipeline, retenção) e o alerta se resolve.

## Controles

| Tecla | Botão | Ação |
|---|---|---|
| `Espaço` | Pausar / Continuar | pausa ou retoma |
| `R` | Reiniciar | recomeça a montagem do zero |
| `L` | 16:9 / Vertical | alterna o layout paisagem e o vertical (fiel à imagem original) |
| `T` | Claro / Escuro | alterna o tema claro (cores da referência) e o escuro, para palco |
| `F` | Tela cheia | entra ou sai da tela cheia |
| `←` `→` | | volta ou avança 1 s |

A barra de controles some sozinha depois de 2,5 s sem mexer o mouse.

Opções no endereço (combine com vírgula, por exemplo `index.html#vertical,dark`):
`#vertical`, `#landscape`, `#dark`, `#loop` (começa já montado, só o loop ao vivo), `#paused` e
`#capture` (esconde os controles, para gravar). Trocar o endereço com a página aberta também aplica as opções.

## GIF e vídeo

- [`gif/fluxo-16x9-claro-montagem-e-loop.gif`](./gif/fluxo-16x9-claro-montagem-e-loop.gif): 1920×1080,
  25 fps, 16,6 s (montagem + um ciclo do loop), repetição infinita.
- [`gif/fluxo-16x9-claro-montagem-e-loop.mp4`](./gif/fluxo-16x9-claro-montagem-e-loop.mp4): a mesma animação em
  H.264. Fica bem menor e não tem o limite de 256 cores do GIF, então é a melhor opção para PowerPoint ou
  Google Slides quando o formato não precisa ser GIF.

Os dois são gravados quadro a quadro com `FLOW.seek(t)`, então cada quadro sai exato. Para gerar de novo ou
fazer outras variações:

```
node tools/gravar-gif.mjs                              # 16:9, claro, montagem + loop
node tools/gravar-gif.mjs --mode loop                  # só o loop de 10 s, sem emenda
node tools/gravar-gif.mjs --layout p --theme dark      # vertical, escuro
node tools/gravar-gif.mjs --mp4                        # também gera o MP4
```

Requisitos: Node 18+, Playwright com Chromium (`npm i -D playwright && npx playwright install chromium`),
[gifski](https://gif.ski) no PATH e, para o MP4, o ffmpeg. As demais opções estão no cabeçalho do script.

## Editar

O `index.html` é gerado; edite os fontes e rode o build (Node 18+):

```
src/template.html   marcação (os ícones entram pelos marcadores <!--ICON:nome-->)
src/style.css       tokens de cor, layouts 16:9 e vertical, tema escuro
src/app.js          motor da animação: layouts, conectores, roteiro de tempo
icons/*.svg         ícones e logos em SVG (viewBox 64×64)
fonts/*.woff2       Plus Jakarta Sans e JetBrains Mono, embutidas no build
build.mjs           node build.mjs  →  index.html
tools/gravar-gif.mjs  grava o GIF (e o MP4) quadro a quadro a partir do index.html
```

A animação é uma função pura do tempo: `render(t)` calcula cada quadro sem estado acumulado. Isso deixa a
gravação quadro a quadro exata. A página expõe `window.FLOW` com `seek(t)`, `play()`, `pause()`,
`setLayout('l' | 'p')` e `setTheme('light' | 'dark')`, além das constantes `T_INTRO` (6,6 s) e `P` (10 s).
Todo movimento contínuo tem período que divide 10 s, então o trecho de `T_INTRO` a `T_INTRO + P` fecha o
loop sem emenda visível.
