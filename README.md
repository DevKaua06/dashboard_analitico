# DataRecupera · Painel de Inadimplência

Dashboard interativo que analisa a base de cadastros de clientes (matrículas) de uma empresa de saneamento e transforma o CSV em indicadores, insights e gráficos filtráveis. Roda 100% no navegador, sem servidor e sem instalação.

## Funcionalidades

**Filtros**
- Filtros por município, bairro, categoria, situação da água, situação do esgoto, hidrômetro e faixa de atraso.
- Contagem em cada opção, calculada com base nos outros filtros ativos (filtro facetado).
- Busca por matrícula, bairro ou município.
- Dívida mínima, período de vencimento (30 a 365 dias) e opção "Só inadimplentes".
- Chips de filtros ativos, removíveis com um clique.

**Gráficos que filtram**
- Clique em uma barra ou fatia para aplicar o filtro. Clique de novo para remover.
- Dívida por município e por bairro (top 10), por situação da água e por categoria.
- Faixa de atraso × volume em R$.
- Evolução mensal da dívida, por mês de vencimento.

**KPIs**
- Valor total devido e dívida com juros (com o acréscimo sobre o principal).
- Taxa de inadimplência e ticket médio da dívida.
- Média de contas em atraso.
- Devedores ligados e candidatos a corte (ligados com 13+ contas).
- Concentração do top 10% dos devedores.

**Insights acionáveis**
- Dívida em ligações ativas, Pareto (top 10%), município líder e bairro mais crítico.
- Cada insight tem um botão que aplica o filtro correspondente.

**Tabela e exportação**
- Tabela ordenável com os maiores devedores.
- Exportação em CSV (separador `;`, UTF-8 com BOM) respeitando os filtros aplicados.

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

- **Inadimplente:** matrícula com valor devido maior que zero.
- **Ligado:** situação da água que começa com "LIGAD". Situações como "DESLIGADO" ficam de fora.
- **Candidato a corte:** matrícula ligada, inadimplente, com 13 ou mais contas em atraso.
- **Período de vencimento:** calculado a partir da data mais recente encontrada na base, e não da data de hoje.
- **Faixas de atraso:** sem atraso, 1 a 5, 6 a 12, 13 a 24, 25 a 48 e mais de 48 contas.

## Ideias para o futuro

- Paginação completa da tabela
- Mapa de calor por bairro
- Salvar filtros no navegador
- Comparação entre períodos
- Tema escuro
