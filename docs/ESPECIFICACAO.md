# LiteGrid Parametric — Especificação

Gerador paramétrico de organizadores modulares com gavetas para impressão FDM.
Objetivo: **usar só o material necessário para ficar rígido, seguro e usável**, com visual agradável. Quem quiser pode engrossar; o mínimo é sempre uma opção.

Este documento substitui `especifica_o_t_cnica_organizador_param_trico_fdm.md`, que serviu de ponto de partida e tem correções listadas na seção 2.

## 1. Escopo e restrições

- 100% no navegador, TypeScript, build estático (GitHub Pages ou Cloudflare Pages). Sem backend, sem Python.
- Sem calibração da impressora. Valores conservadores embutidos, com override em "Avançado".
- Sem estimativa de tempo nem de filamento. O produto final são as **peças prontas para imprimir**.
- Nenhuma peça exige suporte. Detalhes de fixação são recortes no plano da peça ou peças separadas.
- Interface baseada em `exemplo.html` (tema escuro com destaque teal, Rubik e JetBrains Mono, tema claro/escuro), com abas e menus melhor distribuídos.

## 2. Correções em relação à spec original

- `T = N·w` não vale no fatiador: os perímetros se sobrepõem, com espaçamento ≈ `w − h·(1 − π/4)`. Espessura de projeto = `w + (N−1)·espaçamento`. Para bico 0,4, w=0,45, h=0,28: N=2 ≈ 0,84 mm.
- O ângulo do dovetail na §4.4 estava invertido. Regra correta: superfície a **45° ou mais em relação à mesa**. O dovetail foi removido do projeto (fixação entre gabinetes mudou, ver 6.6).
- Os limiares de vão (70/140 mm) e o espaçamento de pilares (25 mm) eram chutes. Passam a ser saídas de regras de cálculo (flecha, esbeltez, flexão do fundo) por carga e material.
- Meia-madeira reduz a seção à metade na junção. Preferir abas passantes e ranhuras no plano.

## 3. Motor de geometria

- Construção **aditiva**: caixas e prismas convexos, sem booleanas. Porta da lógica de `exemplo.html` (`triangulate`, `panel`, `platePart`, `plate`).
- Alternativa para as skins e painéis perfurados: `manifold-3d` (C++ em WebAssembly, funciona em Pages) para booleanas, como faz o Skapa (Skadis no navegador, com three.js). Só entra se a versão aditiva ficar pesada para furos com perfil (chanfro, rebaixo do HSW). O esqueleto continua aditivo.
- Exportação: STL binário e 3MF (zip escrito à mão), por peça, em placa única e em ZIP com tudo, mais o manifesto JSON.
- Eixos do modelo: X largura, Y altura (para cima), Z profundidade (+Z frente).

## 4. Entradas (`ProjectState`)

```ts
interface ProjectState {
  version: number
  name: string
  nozzle: number            // mm
  width: number; height: number; depth: number   // mm, todos entradas
  material: 'PLA' | 'PETG' | 'ABS' | 'PLA-CF'
  materialLevel: 'minimo' | 'equilibrado' | 'reforcado'
  cabinetMode: 'monolitico' | 'esqueleto'
  sections: Section[]       // colunas verticais
  faces: Record<FaceId, FaceConfig>   // gabinete
  fixing: FixingConfig      // 6.6
  drawerDefaults: DrawerConfig
  overrides: Record<string, Partial<DrawerConfig>>  // por gaveta
  advanced: { extrusionFactor?: number; layerHeight?: number; clearances?: Partial<Clearances> }
  printBed: { x: number; y: number }
}
interface Section { width: number | 'auto'; rows: Row[] }
interface Row { height: number | 'auto'; divisions: number; load: 'leve' | 'media' | 'pesada'; drawer?: Partial<DrawerConfig> }
```

Larguras e alturas `auto` dividem o espaço restante. Soma acima do total gera aviso.

## 5. Parâmetros derivados do bico

- Largura de linha `w = bico × 1,125`. Altura de camada ≈ `0,65 × bico`, arredondada ao múltiplo de 0,04.
- Espessuras estruturais em número inteiro de perímetros (N), com o cálculo da seção 2.
- Padrões: paredes de gaveta N=2, estrutura do gabinete N=3, alma entre furos de N=2.
- Folgas padrão: gaveta ~0,3 mm por lado, encaixes ~0,15 mm. Todas com override em Avançado.
- Regra de grade: nenhuma espessura residual menor que 1 linha (`w`).

## 6. Gabinete

### 6.1 Modos
- **Monolítico:** peça única.
- **Esqueleto:** estrutura em peças planas impressas deitadas, montadas por encaixe.

### 6.2 Esqueleto
As medidas de largura, altura e profundidade informadas são as do **esqueleto**. Skins são acessórios e ficam por fora dele (ver 6.3).
- **Peças (cada uma plana, impressa deitada):** costas (XY), base e topo (XZ), quadros verticais (YZ; laterais e um divisor por linha entre seções) e prateleiras (XZ; uma por linha, por seção). A espessura de todas é a de N perímetros estruturais (padrão 3).
- **Barras e janelas:** cada placa é um contorno com barras de largura `bw` (padrão ~8 mm, cresce com o bico) e janelas entre elas. Nos quadros, as barras horizontais ficam nos níveis das prateleiras.
- **Encaixes no plano:** abas que atravessam ranhuras da placa vizinha, com folga de encaixe padrão de 0,15 mm por lado. Quadro nas costas, quadro na base e no topo, prateleira no quadro e prateleira, base e topo nas costas. Nos quadros divisores, as abas de prateleiras vizinhas têm meia espessura para não colidirem. Nas faces externas as abas ficam rentes.
- **Divisórias entre gavetas:** cada fila com divisões ganha uma placa vertical (YZ) entre gavetas vizinhas, com abas que atravessam ranhuras nas prateleiras, na base e no topo e nas costas. Elas usam janelas com diagonal, como os quadros, e nada se sobrepõe às gavetas (a espessura já é reservada no layout).
- **Prateleiras (trilhos):** três aberturas conforme o nível de material e a carga da gaveta que apoiam: trilhos (mínimo), moldura com travessas (equilibrado) ou fechada (reforçado ou carga pesada). Os trilhos laterais são largos (~14 mm) e as faixas sobre quadros e divisórias ainda mais (~16 mm), para a gaveta continuar apoiada se deslizar para o lado. Barras transversais atravessam a janela para a gaveta não cair por ela.
- **Travamento (`skeleton.bracing`):** `auto` = uma diagonal por janela (Warren, alternando o sentido) nas costas e nos quadros; `diagonal` = X em cada janela; `corners` = esquadros de 45°; `back` = costas fechadas mais diagonais nos quadros; `none` = sem travamento (o gerador avisa).
- **Sempre autônomo:** firme sem nenhuma skin, e a geometria do esqueleto não muda quando se ativa uma skin.
- **Furos de ancoragem:** as barras externas de cada face já saem com furos para os pinos de skins e de fixações (`faceAnchors`), com ou sem skin no projeto.
- **Divisão pela mesa:** se uma placa não cabe em `printBed` (em qualquer orientação, com 4 mm de margem), o gerador a divide em partes com **encaixe rabo de andorinha dentro do próprio plano** da placa (imprime deitada, sem suporte). Os nós são reduzidos automaticamente para caber em barras estreitas; sem lugar para nó, a emenda é de topo (colar). O aviso lista as placas divididas.
- **Monolítico:** as mesmas placas sem abas nem ranhuras, apoiadas face com face, numa peça só impressa em pé sobre as costas.

### 6.3 Skins (paredes externas, opcionais)
- Por face: esquerda, direita, topo, base, costas. A frente é aberta para as gavetas.
- Tipos: fechada, vazada (padrões da seção 8), treliça, painel de fixação (Skadis, Pegboard, HSW).
- Ficam **por fora** do esqueleto: cada skin **acrescenta** a sua espessura (e o recuo, se houver) ao tamanho externo do gabinete. Isso mantém o esqueleto idêntico com ou sem skin e permite imprimir as skins depois.
- Imprimem deitadas, uma cor por peça, e prendem nos furos de ancoragem do esqueleto por pinos, com cola ou parafuso opcionais.
- Geradas depois, a partir do mesmo projeto salvo, com encaixe garantido: as medidas do esqueleto são determinísticas.

#### Espaçadores automáticos
- Skins de painel de fixação (Skadis, Pegboard, HSW) precisam de espaço livre atrás para as garras dos ganchos. Quando a skin é gerada, o gerador calcula o recuo necessário do sistema e **gera os espaçadores** que afastam a skin do esqueleto, sem sobra nem falta. A gaveta continua no lugar; só a skin sai para fora.
- Recuo padrão: Skadis 20 mm (informado; o modelo de referência usa calços de 23,9 mm). Pegboard e HSW começam com 20 mm como valor provisório, ajustável, até termos a medida real.
- Formato do espaçador, seguindo o modelo de referência: **calço cônico** (base quadrada de 16 ou 32 mm que afunila para o topo, com furo central para parafuso), impresso em pé, sem suporte. Alternativa: régua (nervura) com a largura igual ao recuo, impressa deitada, com abas nas ranhuras do esqueleto e da skin.
- O contorno total do gabinete no relatório de dimensões inclui o recuo dessa face.
- Na parede, o mesmo cálculo gera os calços entre o painel e a parede.

### 6.4 Modelo de face
| Campo | Opções |
|---|---|
| Preenchimento | Nenhum, Fechado, Vazado, Treliça, Painel de fixação (Skadis, Pegboard ou HSW; ver 6.6) |
| Moldura | borda sólida de N linhas |
| Fechada até altura | X mm ou X%, vazada acima |
| Abertura | % alvo de área vazada |
| Reforço | Auto, Nenhum, Nervuras, Pilares e vigas, Treliça (Warren, Pratt), X, Ondulada |

### 6.5 Prateleiras
Sem chapa cheia: trilhos laterais por gaveta com chanfro de 45°.

### 6.6 Fixações (sem saliência em balanço)
- **Entre gabinetes:** pinos e furos de alinhamento (pino vertical curto, chanfrado) + chave borboleta (peça separada, recortes no plano). Opcionais: parafuso passante M3/M4 com alojamento de porca aberto, ímã embutido. Ou crescer o próprio gabinete com nova seção ou fila.
- **Parede:** furos com rebaixo e rasgos de fechadura no painel de costas. Ripa francesa a 45° em duas tiras separadas (uma na parede, outra nas costas). Aviso: a capacidade depende de parafuso e bucha.
- **Skadis (padrão IKEA):**
  - Fenda vertical (eixo maior em Y) de 5 mm por 15 mm, com pontas em semicírculo (raio 2,5 mm). Compensação de fabricação: altura 15,2 mm (parâmetro de tolerância).
  - Chanfro de entrada nas duas faces: no modelo de referência (Skadis_Pegboard_Gen2, painel de 5 mm) a fenda mede ~7,2 × 17,1 mm na face e afunila para 5 × 15 mm, a ~45° e ~1 mm de profundidade. Facilita a entrada dos ganchos e imprime sem suporte.
  - Grade medida no modelo de referência: linhas a cada 20 mm em Y, 40 mm entre fendas na mesma linha, e cada linha deslocada 20 mm em X em relação à anterior (equivale a duas grades de 40 × 40 mm deslocadas de 20 × 20 mm). Ganchos de múltiplos de 40 mm funcionam nas duas grades.
  - Material entre fendas: ~25 mm na vertical e ~35 mm na horizontal na mesma grade de 40 × 40 (consequência do passo).
  - Espessura do painel: 3 a 5 mm (original: 5 mm). Acima de 5 mm as garras dos ganchos não abraçam o furo, e o gerador avisa. Engrossar só ao redor das fendas, sem passar de 5 mm no total.
  - **Recuo:** as garras entram atrás do painel, então tem que haver espaço livre de pelo menos 20 mm atrás dele (parâmetro `recuo`, padrão 20 mm). Uma skin Skadis numa lateral do gabinete fica afastada do esqueleto pelos espaçadores automáticos (ver 6.3), e o interior do gabinete não é afetado. Na parede, o painel também fica afastado por calços.
  - Também é possível pendurar o gabinete numa placa Skadis (ganchos nas costas). Medidas de referência do clipe, lidas no projeto Skapa (nmattia/skapa, `src/model/manifold.ts`; o repositório não declara licença, então usamos só as dimensões funcionais e escrevemos a nossa própria geometria):
    - Perfil de cada garra (X, Z em mm): (0,95; 0), (2,45; 0), (2,45; 3,7), (3,05; 4,3), (3,05; 5,9), (2,45; 6,5), (0,95; 6,5). Ou seja, lâmina de 1,5 mm que entra na fenda de 5 mm (folga de 0,05 mm por lado) e um dente de 0,6 mm que trava atrás do painel.
    - Comprimento da garra ao longo da fenda: 12 mm (fenda de 15 mm).
    - Cada clipe usa **duas garras espelhadas** na mesma fenda, com o dente para fora (largura total 6,1 mm contra 5 mm da fenda): elas flexionam para dentro ao entrar e travam.
    - Clipes em pares a cada 40 mm na horizontal e 40 mm na vertical.
    - Nos clipes acima do primeiro, a parte de baixo leva chanfro de 45° para imprimir sem suporte.
  - **Dois sentidos, com o mesmo par de peças encaixando entre si e nos acessórios originais IKEA** (funcionalidade inspirada no "Skadis Generator"):
    - **Ganchos (entrada):** garras que saem de qualquer face plana do gabinete ou de um acessório, ou soltas na origem.
    - **Furos receptores (saída):** o padrão de fendas cortado numa face, que vira uma miniatura de painel Skadis.
    - **Cavidade automática atrás dos furos:** o espaço mínimo para o gancho entrar e assentar, dimensionado pelo próprio padrão. O modo padrão é **um bolso por fenda** (só onde precisa, imprime sem suporte em qualquer orientação). Alternativa: cavidade única. Em vez de afastar a face inteira 20 mm, o bolso por fenda reduz o material e o recuo; a profundidade do bolso é parâmetro, com valor a validar com acessórios originais (a garra tem 6,5 mm de profundidade). O afastamento por espaçadores continua como modo conservador.
    - **Grade por contagem:** colunas (1 a 20) e linhas (1 a 10) com o espaçamento padrão, mais colunas intermediárias intercaladas (o deslocamento de 20 mm).
    - **Parâmetros de ajuste:** folga da placa, altura do pino, altura do lábio, folga de fenda e de cavidade, rotação (3 eixos e do padrão no plano) e deslocamento em X e Y.
    - **Impressão:** chanfro do lábio para imprimir sem suporte, chanfro de entrada para o gancho se autoalinhar, arredondamento das bordas.
- **Pegboard tradicional (furos redondos):** furos de 1/4" (6,35 mm) ou 1/8" (3,17 mm), grade quadrada de 1" (25,4 mm) entre centros. Vale também o recuo atrás do painel, como no Skadis. Nas peças deitadas o furo é vertical, então o círculo não tem restrição de ângulo.
- **HSW (Honeycomb Storage Wall, RostaP):** furo hexagonal com degrau interno.
  - **Medido nos arquivos de teste** `HSW Test Wall SD.stl` (8 mm) e `HD.stl` (10 mm). As duas versões usam a mesma grade e o mesmo furo.
  - Grade: hexágonos com base plana na horizontal (vértice para os lados). Todos os seis vizinhos ficam a **23,6 mm** entre centros: 23,6 mm na vertical dentro da mesma coluna, colunas a **20,44 mm** (23,6 × √3/2) na horizontal, e colunas vizinhas deslocadas de 11,8 mm em Y. A repetição na horizontal é de 40,88 mm (duas colunas). Isso explica os números 23,6 e 40,88 vindos da fonte.
  - Perfil do furo (face a face, de uma face à outra), versão **SD, 8 mm**:
    - 0 a 0,5 mm: chanfro de 20,8 para 20,0 mm (face de trás, encosta na parede).
    - 0,5 a 5,1 mm: furo de **20,0 mm** (ponta a ponta 23,09 mm).
    - 5,1 a 6,0 mm: rampa de 20,0 para 22,0 mm.
    - 6,0 a 8,0 mm: **22,0 mm** (ponta a ponta 25,4 mm), aberto na face da frente (usuário).
  - Versão **HD, 10 mm:** igual até 8 mm; depois o furo volta de 22,0 para 20,0 mm até 9,19 mm, segue em 20,0 mm até 9,7 mm e abre em chanfro até 20,6 mm na face. Ou seja, o rebaixo de 22 mm vira um canal interno fechado por um lábio, para o ressalto dos plugues travar.
  - Parede entre furos: 3,6 mm no furo de 20 mm e 1,6 mm no rebaixo de 22 mm.
  - Impressão: a rampa de 5,1 a 6 mm abre para cima, então o material da rampa é sustentado por baixo com a face da frente para cima. Na HD, a rampa de volta (8 a 9,19 mm) é um balanço de ~1 mm por lado em ~1,2 mm de altura (≈ 40 a 45°): confirmar no fatiador, ou imprimir a HD com a face da frente para baixo e conferir a outra rampa.
  - Os plugues de encaixe (inserts) são peças separadas, com corpo de ~19,8 a 19,9 mm para o encaixe por fricção.

## 7. Gavetas

- Estilo de parede: sólida, vazada, nervurada. Cada parede e o fundo usam o modelo de face (6.4).
- Frente: recorte, barra, lisa, aba; chanfro em vez de arredondado.
- Porta-etiqueta, divisórias removíveis (ranhuras N=2), cantos internos chanfrados a 45°.
- Fundo fino com nervuras por baixo quando a carga pede.
- Borda superior reforçada em paredes altas.

### Reforço de parede alta: sugestões, nunca obrigatório
O motor sugere e o usuário aplica: nervura, borda superior, pilares e vigas, treliça, X, ondulada. Escolhe a opção que usa menos material entre as viáveis.

### Nível de material e carga
`materialLevel` (mínimo, equilibrado, reforçado) e carga por gaveta (leve ≈ parafusos e SMD, média, pesada ≈ ferramentas). Regras simples: flecha do trilho, esbeltez da parede, flexão do fundo. Avisos incluem fluência do PLA e amolecimento perto de 55 °C.

## 8. Padrões de vazado

Triângulo, hexágono, losango (quadrado a 45°), círculo.
- Peças impressas **deitadas** (painéis, fundos): qualquer forma serve, o furo é vertical.
- Gavetas impressas de pé: hexágono de base plana (vértices para os lados): topo horizontal curto (ponte) e lados a 60°; a versão de ponta para cima teria teto de 30° e precisaria de suporte. Círculo vira gota (ponta a 45° no topo) ou fica pequeno; triângulo com ponta para baixo só em tamanho pequeno.
- Tamanho do furo limitado ao **menor item guardado** (parâmetro), com aviso.
- Alma entre furos em múltiplos de linha.

## 9. Saídas

- Peças por tipo com quantidade, dimensões, orientação de impressão e exportação individual.
- STL por peça, placa única (por tamanho de mesa), 3MF, ZIP.
- `layout_manifest.json` com seções, filas, vãos e gavetas recomendadas.
- Guia de montagem numerado.
- Perfil de fatiador recomendado: perímetros, infill 0%, camadas sólidas de topo e base, posição da costura, Arachne.

## 10. Persistência

- Autosave no `localStorage`, com try/catch e fallback quando indisponível. Esquema com `version` e migração.
- Salvar e importar arquivo JSON. Vários projetos nomeados, presets embutidos (parafusos, SMD, ferramentas).

## 11. Interface

- **Cabeçalho:** nome, presets, salvar e abrir, tema, menu Exportar.
- **Visualização:** abas 3D, Frontal 2D, Mesa, Explodida. Wireframe, cotas, corte, abertura das gavetas, explosão. Seleção sincronizada entre 2D, 3D e barra lateral.
- **Botão direito do mouse:** serve só para controlar a visualização (orbitar ou deslocar a câmera). O menu de contexto do navegador é bloqueado sobre a área de visualização, e não há menus de contexto próprios em outros lugares.
- **Barra lateral em abas:** Projeto, Layout, Gabinete, Gavetas, Fixação, Avançado, Peças (com Manifesto). Bolinha de aviso por aba. Em telas estreitas, vira folha inferior.

## 12. Roadmap

1. Núcleo: parâmetros derivados do bico e testes.
2. Layout: seções, filas, vãos e manifesto.
3. Gaveta (motor + exportação).
4. Esqueleto do gabinete.
5. Skins e fixações.
6. Interface, persistência e deploy.

## 13. Em aberto

- Valores padrão de folga e fator de extrusão (validar com a peça de teste).
- Painéis em mosaico (modelo de referência Skadis_Pegboard_Gen2, painéis de 120 mm): bordas com abas de encaixe, furos de fixação nos cantos, e conectores em placa (16×16, 16×32 e 32×32 mm, ~3,9 mm) em bolsos no verso, sobre as emendas. Avaliar se a skin Skadis do gabinete deve seguir esse formato quando passar do tamanho da mesa.
- Peça de teste: gaveta pequena com as mesmas paredes e reforços, para validar antes do conjunto.
