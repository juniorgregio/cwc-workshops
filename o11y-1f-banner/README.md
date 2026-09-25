# Banner One Financial Observability × Accenture × Dynatrace

Banner co-branded para divulgação dentro do Dynatrace, redesenhado a partir do banner original com
foco em profissionalismo, **logo oficial da Accenture** e **preservação do logo One Financial
Observability (O11y 1F)**.

![Banner animado](output/animado/o11y-1f-banner-animado-loop.gif)

## Arquivos

| Arquivo | Uso |
| --- | --- |
| `output/o11y-1f-accenture-dynatrace-banner.png` | **Banner final, 3840 × 461 px**: mesmas dimensões do original, substituição direta |
| `output/o11y-1f-accenture-dynatrace-banner-1920.png` | Versão leve, 1920 × 231 px |
| `output/animado/` | **Versões animadas**: GIF em loop, GIF com intro, WebP e MP4 (ver abaixo) |
| `banner.html` | Fonte editável (HTML/CSS, sem dependências de rede) |
| `banner-animado.html` | Fonte da animação (mesmo layout, animado só com CSS) |
| `logos-png/` | **Logos em PNG com fundo transparente** para download (ver abaixo) |
| `assets/` | Emblema O11y 1F, logos oficiais (SVG) e fontes locais (Open Sans Bold, Inter; licença OFL 1.1) |
| `render.js`, `export-logos.js`, `animate.js`, `package.json` | Scripts para gerar os PNGs do banner, dos logos e as versões animadas |
| `docs/antes-depois.jpg` | Comparativo antes × depois |
| `docs/antes-original.jpg` | Banner original, para referência |

## Banner animado (`output/animado/`)

| Arquivo | Formato | Uso |
| --- | --- | --- |
| `o11y-1f-banner-animado-loop.gif` | GIF 1920 × 231, 8 s, loop infinito | **Para o Dynatrace** (funciona em qualquer tile ou markdown de imagem) |
| `o11y-1f-banner-animado-intro.gif` | GIF 1920 × 231, 3,5 s, toca uma vez | Entrada animada que para no banner final |
| `o11y-1f-banner-animado-loop.webp` | WebP animado 1920 × 231, loop infinito | Mesma animação do GIF com qualidade máxima (sem perdas) |
| `o11y-1f-banner-animado.mp4` | MP4 H.264 3840 × 460, 19,5 s | Apresentações e redes sociais: intro + 2 loops |

**A animação ("pulso de telemetria"):**

- **Entrada (3,5 s):**
  1. Uma luz lilás acende atrás do escudo e se abre no halo.
  2. O escudo e o nome aparecem.
  3. Uma linha de telemetria se desenha para a direita, como um batimento lilás→roxo Accenture.
  4. Accenture e Dynatrace aparecem quando a linha passa por eles.
  5. Um batimento azul Dynatrace surge depois dos logos, e o copyright aparece por último.
  6. Tudo termina exatamente no banner estático aprovado.
- **Loop (8 s, sem emenda):**
  - O halo atrás do escudo “respira” duas vezes.
  - Na respiração mais forte, um pulso de luz sai do logo O11y, percorre o batimento no espaço antes
    da Accenture, passa por trás dos parceiros e repete o batimento azul antes do copyright.
  - Depois vêm ~4,5 s de calma.

**Regras respeitadas:**

- Os logos da Accenture e da Dynatrace só aparecem com um fade na entrada. No loop ficam 100%
  parados, e nenhuma luz passa sobre eles (medido: 0 pixels alterados nos logos, no nome O11y e no
  copyright).
- O escudo O11y nunca muda de cor nem de forma; só o brilho atrás dele se mexe.
- Com “reduzir movimento” ativo no navegador, `banner-animado.html` mostra o banner estático.

## Logos em PNG (`logos-png/`)

Todos têm fundo transparente. Para baixar tudo de uma vez, use `logos-png.zip`.

| Arquivo | Tamanho | Uso |
| --- | --- | --- |
| `accenture-logo-fundo-escuro.png` | 2000 × 527 | Accenture oficial, wordmark branco + `>` roxo (para fundos escuros) |
| `accenture-logo-fundo-claro.png` | 2000 × 527 | Accenture oficial, wordmark preto + `>` roxo (para fundos claros) |
| `dynatrace-logo-fundo-escuro.png` | 2000 × 355 | Dynatrace oficial, wordmark branco (para fundos escuros) |
| `dynatrace-logo-fundo-claro.png` | 2000 × 355 | Dynatrace oficial, wordmark preto (para fundos claros) |
| `o11y-1f-logo-completo.png` | 985 × 369 | Logo One Financial Observability completo (escudo + nome), como no banner (para fundos escuros) |
| `o11y-1f-emblema.png` | 306 × 369 | Só o escudo O11y 1F, na resolução original (para fundos escuros) |

O escudo O11y 1F foi desenhado para fundo escuro. Sobre branco aparece uma borda escura, que vem
da arte original. As versões SVG da Accenture e da Dynatrace estão em `assets/logos/` e podem ser
ampliadas sem perda.

## O que mudou em relação ao original

- **Fundo**: a foto de escritório (com os “3” soltos no vidro) virou um gradiente índigo-marinho
  sóbrio, com um halo roxo discreto só atrás do emblema.
- **Hierarquia em três zonas num único eixo horizontal**:
  1. **Logo O11y 1F**: marca principal, à esquerda.
  2. **Accenture | Dynatrace**: logos parceiros, ao centro, com o mesmo peso visual.
  3. **Copyright**: à direita, na mesma linha de base dos logos parceiros e legível mesmo em
     meia escala. O “System Status: Operational” do original foi removido.
- **Accenture adicionada** com o logo oficial.
- Grid, margens e espaçamentos consistentes. O copyright ganhou tamanho e contraste.

## Logos e regras de marca

- **One Financial Observability (O11y 1F)**, preservado:
  - O **emblema** foi recortado do banner original **sem nenhuma alteração** (306 × 369 px, apenas
    com o fundo removido) e é exibido no tamanho nativo, sem ampliação.
  - O **nome** usa a mesma fonte do original (**Open Sans Bold**, comparada lado a lado), com
    “ONE FINANCIAL” em branco e “OBSERVABILITY” no roxo original (matiz 267°, só um pouco mais claro
    para dar contraste). A segunda linha continua recuada, e as proporções entre emblema e nome são
    as do original.
- **Accenture**: lockup oficial com o wordmark “accenture” e o símbolo `>` em roxo **#A100FF**, na
  versão reversa (wordmark branco) indicada para fundos escuros. O wordmark foi conferido contra o
  SVG publicado em accenture.com (sobreposição de 98,6%).
- **Dynatrace**: SVG oficial extraído do cabeçalho de dynatrace.com (wordmark branco + símbolo colorido).
- Os logos são usados **sem modificação**: sem filtros, efeitos, recoloração ou distorção, com
  área de proteção ao redor e proporção de altura Accenture:Dynatrace de 1,26 para equilibrar o
  peso visual.

> Accenture e Dynatrace são marcas registradas de seus respectivos titulares. Para peças oficiais de
> co-marketing, vale confirmar o uso com os times de marca/parcerias das duas empresas.

## Como o design foi escolhido

Foram produzidas 4 direções (Executive minimal, Premium gradient accent, Structured partner bar e
Telemetry motif). Três avaliadores deram notas a cada uma:

- conformidade de marca;
- qualidade visual;
- encaixe e legibilidade dentro do Dynatrace, em tamanhos reduzidos e sobre fundos de UI claro e
  escuro.

A vencedora (Executive minimal, 25/30) foi refinada com as correções apontadas. Em seguida passou
por verificações automáticas de:

- medidas;
- integridade dos arquivos de logo;
- fontes carregadas;
- contraste do texto;
- fidelidade do logo O11y 1F em relação ao original.

Veja `docs/antes-depois.jpg`.

## Editar e gerar novamente

```bash
cd o11y-1f-banner
npm install
npx playwright install chromium
npm run render         # gera os dois PNGs do banner em output/
npm run export-logos   # gera os PNGs dos logos em logos-png/
npm run animate        # gera GIF, WebP e MP4 animados em output/animado/ (usa ffmpeg; ~2 min)
```

Os textos, cores e posições ficam em `banner.html`, e o grid está documentado no comentário do topo.
Se o texto ou algum tamanho mudar, recentre `.partners` para manter iguais os espaços entre as zonas.

**Limitação conhecida:** o emblema O11y 1F veio do JPEG original, então é um bitmap levemente
suave em 100% de zoom. No tamanho de exibição (~1920 px) ele fica nítido. Se houver uma versão
vetorial ou em alta resolução do emblema, basta substituir `assets/o11y-1f-emblem.png` mantendo a
proporção 306:369.
