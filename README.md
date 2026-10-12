# Pedágio Fácil

O **Pedágio Fácil** é uma aplicação web desenvolvida para facilitar a organização e a análise de extratos de pedágio da ConectCar, auxiliando na identificação e separação dos lançamentos e na visualização dos valores correspondentes.

O projeto surgiu a partir de uma demanda real em que motoristas buscavam por uma solução que simplificasse esse processo, sendo desenvolvido como parte de uma atividade de extensão acadêmica.

## Funcionalidades

- Importação de extratos ConectCar em formatos compatíveis, como Excel e CSV.
- Classificação dos lançamentos entre Motorista e Empresa.
- Separação dos valores por categoria.
- Desconsideração de créditos e recargas nos cálculos dos totais de despesas.
- Identificação de lançamentos que precisam de revisão.
- Exportação dos resultados para uma planilha Excel com abas de resumo e lançamentos, filtros e formatação.

## Tecnologias utilizadas

- React
- Vite
- JavaScript
- ExcelJS
- SheetJS (XLSX)
- HTML e CSS

## Como executar o projeto localmente

### Pré-requisitos

- Node.js instalado.
- npm disponível no terminal.

### Instalação

1. Clone o repositório:

   ```bash
   git clone https://github.com/keylafroes/pedagio-facil.git
   ```

2. Acesse a pasta do projeto:

   ```bash
   cd pedagio-facil
   ```

3. Instale as dependências:

   ```bash
   npm install
   ```

4. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

5. Acesse o endereço local informado pelo Vite no terminal.

### Compilação para produção

Para verificar a compilação da aplicação, execute:

```bash
npm run build
```

## Acesso à aplicação

**Aplicação publicada:** a ser disponibilizada.

**Repositório:** https://github.com/keylafroes/pedagio-facil

## Privacidade e uso responsável

Utilize arquivos de teste ou extratos devidamente anonimizados durante demonstrações e testes públicos. Não compartilhe informações pessoais, financeiras ou outros dados sensíveis sem autorização.

## Contexto acadêmico

Projeto desenvolvido no contexto de uma atividade de extensão do curso de Análise e Desenvolvimento de Sistemas, com o objetivo de aplicar conhecimentos de desenvolvimento web na construção de uma solução para uma necessidade prática.
