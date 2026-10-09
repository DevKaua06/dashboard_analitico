# DataRecupera · Painel de Inadimplência

Dashboard interativo que analisa a base de cadastros de clientes (matrículas) de uma empresa de saneamento e transforma o CSV em indicadores, insights e gráficos filtráveis. Roda 100% no navegador, sem servidor e sem instalação.

## Funcionalidades

**Filtros**
- Filtros por município, bairro, categoria, situação da água e do esgoto, hidrômetro, faixa de atraso, idade da dívida, tipo de pessoa, negativação (Serasa), situação da cobrança e telefone para contato (com celular, só fixo, sem telefone).
- Contagem em cada opção, calculada com base nos outros filtros ativos (filtro facetado).
- Busca por matrícula, bairro ou município.
- Dívida mínima, contas em atraso mínimas, período do último vencimento (30 a 365 dias) e opção "Só inadimplentes".
- Critério de corte configurável (padrão: 3 ou mais contas).
- Chips de filtros ativos, removíveis com um clique.

**Gráficos que filtram**
- Clique em uma barra ou fatia para aplicar o filtro. Clique de novo para remover.
- Dívida por município e por bairro (top 10), por situação da água e por categoria.
- Faixa de atraso (quantidade de contas) × volume em R$.
- Idade da dívida, contada desde o menor vencimento em aberto.

**KPIs**
- Valor total devido e valor com multas e juros.
- Taxa de inadimplência (sobre clientes ligados e cortados) e ticket médio.
- Dívida com mais de 5 anos, devedores ligados e candidatos a corte (com quantos têm celular).
- Negativados no Serasa, valor em revisão e concentração do top 10%.

**Insights acionáveis**
- Candidatos a corte, dívida muito antiga, devedores sem contato, Pareto (top 10%), município líder e bairro mais crítico.
- Cada insight tem um botão que aplica o filtro correspondente.

**Tabela e exportação**
- Tabela ordenável com os maiores devedores.
- Exportação em CSV (separador `;`, UTF-8 com BOM) respeitando os filtros aplicados e incluindo o telefone.

## Como usar

1. Clone o repositório e mantenha os três arquivos na mesma pasta.
2. Abra o `index.html` no navegador. Uma conexão com a internet é necessária para carregar as bibliotecas via CDN.
3. Clique em **Carregar base (.csv)** e selecione o arquivo.

```bash
git clone <url-do-repositorio>
cd <pasta-do-projeto>
# abra o index.html, ou sirva localmente:
python3 -m http.server 8000
```

## Formato do CSV

O separador (`;`, `,` ou tabulação) e a codificação (UTF-8 ou Latin-1) são detectados automaticamente. Os nomes das colunas não diferenciam maiúsculas de minúsculas.

| Coluna | Obrigatória | Uso |
|---|---|---|
| `MATRICULA` | Sim | Identificador. Linhas sem matrícula são ignoradas. |
| `MUNICIPIO`, `BAIRRO` | Não | Localização |
| `CATEGORIA PRINCIPAL` | Não | Categoria. O prefixo numérico ("1 - ") é removido. |
| `SITUACAO AGUA`, `SITUACAO ESGOTO` | Não | Situação das ligações |
| `NR HID.` | Não | Define se a matrícula tem hidrômetro |
| Colunas de telefone (nome contendo `TEL`, `FONE`, `CELULAR`, `CONTATO` ou `WHATS`) | Não | Aceita várias numerações na mesma célula, separadas por `\|`. Celular = 11 dígitos com 9 após o DDD; fixo = 10 dígitos. Sem essas colunas, o filtro fica oculto. |
| `TIPO DE PESSOA` | Não | Pessoa física ou jurídica |
| `SIT. COBRANCA SERASA` | Não | Preenchida = negativado |
| `SIT. ESPECIAL DE COBRANCA` | Não | Preenchida = cobrança paralisada (ex.: processo judicial) |
| `MENOR VENCIMENTO` | Não | Base da idade da dívida |
| `VALOR TOTAL EM REVISAO` | Não | Contas contestadas, mostradas à parte e não somadas ao devido |
| `QTD. CONTAS DEVIDO` | Não | Quantidade de contas em atraso |
| `VALOR TOTAL DEVIDO`, `VALOR TOTAL COM JUROS` | Não | Valores. Aceita formato BR (`1.500,50`). |
| `MAIOR VENCIMENTO` (ou `MENOR VENCIMENTO`, `DATA VENCIMENTO`) | Não | Data de vencimento, em `DD/MM/AAAA` ou `AAAA-MM-DD` |
| `MAIOR REFERENCIA DEVIDO` | Não | Alternativa de data, em `MM/AAAA` |

Valores ausentes viram "Não informado".

## Estrutura do projeto

```
.
├── index.html   # estrutura da página
├── styles.css   # estilos customizados
├── app.js       # leitura do CSV, filtros, KPIs, insights e gráficos
└── README.md
```

## Tecnologias

- HTML, CSS e JavaScript puro
- [Tailwind CSS](https://tailwindcss.com/) (CDN)
- [Chart.js](https://www.chartjs.org/)
- [PapaParse](https://www.papaparse.com/)
- [Font Awesome](https://fontawesome.com/) e fonte Inter

## Privacidade

Os dados são processados somente no navegador. Nenhum arquivo é enviado a servidores.

**Não versione bases reais de clientes no repositório.** Adicione ao `.gitignore`:

```gitignore
*.csv
```

## Regras de negócio

- **Duplicidades:** matrículas repetidas são removidas (mantém a primeira) e o aviso aparece no subtítulo.
- **Inadimplente:** matrícula com valor devido maior que zero.
- **Taxa de inadimplência:** devedores ÷ clientes ligados e cortados. Imóveis potenciais, factíveis e suprimidos ficam fora do denominador.
- **Ligado:** situação da água que começa com "LIGAD". Situações como "DESLIGADO" ficam de fora.
- **Candidato a corte:** matrícula ligada, inadimplente, com cobrança ativa (não paralisada) e com o mínimo de contas definido no campo "Critério de corte" (padrão: 3).
- **Idade da dívida:** dias entre o menor vencimento em aberto e o vencimento mais recente da base.
- **Período de vencimento:** calculado a partir da data mais recente encontrada na base, e não da data de hoje.
- **Faixas de atraso:** sem atraso, 1 a 5, 6 a 12, 13 a 24, 25 a 48 e mais de 48 contas.

## Ideias para o futuro

- Paginação completa da tabela
- Mapa de calor por bairro
- Salvar filtros no navegador
- Comparação entre períodos
- Tema escuro
