# Observabilidade → MCP OPS · fluxo animado

Versão animada (estilo *archify*) do diagrama de arquitetura em [`docs/referencia.jpg`](./docs/referencia.jpg):
Aplicações → Observabilidade → OTEL Collector → Repositórios → Monitoração + MCP OPS, com o MCP OPS
atuando de volta em todas as camadas e a faixa de resultados no rodapé.

Abra **`index.html`** direto no navegador. O arquivo é autocontido: fontes, ícones e logos estão embutidos,
então funciona offline, inclusive no projetor.

## O que acontece na tela

1. **Montagem (0–7,2 s)**: cada bloco é desenhado na ordem do fluxo, os conectores se ligam, o feedback do
   MCP OPS aparece e a faixa de resultados sobe.
2. **Ao vivo (loop contínuo de 10 s)**: pacotes de *logs*, *métricas* e *traces* saem das Aplicações,
   acendem Log4J / Biblioteca Padronizada / OpenTelemetry SDK, passam pelo OTEL Collector, chegam ao Loki e
   ao Dynatrace SaaS e se dividem entre a Monitoração (alerta no Grafana, notificação no WhatsApp e no Teams)
   e o MCP OPS (Agentes de IA → Insights e Diagnósticos → Automação → Recomendações). Em seguida o MCP OPS
   devolve ações a cada camada e os quatro resultados se destacam em sequência.

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
`#capture` (esconde os controles, para gravar).

## Editar

O `index.html` é gerado; edite os fontes e rode o build (Node 18+):

```
src/template.html   marcação (os ícones entram pelos marcadores <!--ICON:nome-->)
src/style.css       tokens de cor, layouts 16:9 e vertical, tema escuro
src/app.js          motor da animação: layouts, conectores, roteiro de tempo
icons/*.svg         ícones e logos em SVG (viewBox 64×64)
fonts/*.woff2       Plus Jakarta Sans e JetBrains Mono, embutidas no build
build.mjs           node build.mjs  →  index.html
```

A animação é uma função pura do tempo: `render(t)` calcula cada quadro sem estado acumulado. Isso deixa a
gravação quadro a quadro exata. A página expõe `window.FLOW` com `seek(t)`, `play()`, `pause()`,
`setLayout('l' | 'p')` e `setTheme('light' | 'dark')`, além das constantes `T_INTRO` (7,2 s) e `P` (10 s).
Todo movimento contínuo tem período que divide 10 s, então o trecho de `T_INTRO` a `T_INTRO + P` fecha o
loop sem emenda visível.
