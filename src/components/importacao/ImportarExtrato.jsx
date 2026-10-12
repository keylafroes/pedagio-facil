import { useState } from 'react'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import './ImportarExtrato.css'

function normalizarTexto(texto = '') {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function converterValor(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return Math.abs(valor)
  }

  if (valor === null || valor === undefined || valor === '') {
    return null
  }

  let texto = String(valor).trim().replace(/\s/g, '')
  texto = texto.replace(/R\$/gi, '')

  if (/^-?[\d.]+,\d{2}$/.test(texto)) {
    texto = texto.replace(/\./g, '').replace(',', '.')
  } else if (/^-?[\d,]+\.\d{2}$/.test(texto)) {
    texto = texto.replace(/,/g, '')
  } else if (/^-?[\d,]+$/.test(texto) && texto.includes(',')) {
    texto = texto.replace(',', '.')
  }

  const numero = Number(texto)
  return Number.isFinite(numero) ? Math.abs(numero) : null
}

function converterData(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor
      .toLocaleString('pt-BR', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      .replace(',', ' -')
  }

  if (typeof valor === 'number') {
    const data = XLSX.SSF.parse_date_code(valor)

    if (data) {
      const dia = String(data.d).padStart(2, '0')
      const mes = String(data.m).padStart(2, '0')
      const ano = data.y
      const hora = String(data.H).padStart(2, '0')
      const minuto = String(data.M).padStart(2, '0')
      const segundo = String(Math.floor(data.S)).padStart(2, '0')

      return `${dia}/${mes}/${ano} - ${hora}:${minuto}:${segundo}`
    }
  }

  return String(valor ?? '').trim()
}

function classificarLancamento(descricao, valorDebito) {
  const texto = normalizarTexto(descricao)

  if (
    texto.includes('recarga') ||
    texto.includes('estacionamento') ||
    texto.includes('mensalidade') ||
    texto.includes('plano completo') ||
    texto.includes('retirada de credito')
  ) {
    return 'Ignorar'
  }

  if (valorDebito === null) {
    return 'Revisar'
  }

  if (texto.includes('passagem com vale pedagio')) {
    return 'Empresa'
  }

  const temDataHora =
    /\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/.test(descricao)

  const eConcessionaria =
    /(motiva|rota das bandeiras|minas|freeflow|ecopistas|tamoios|eco ilhabela)/i.test(
      texto,
    )

  if (temDataHora && eConcessionaria) {
    return 'Motorista'
  }

  return 'Revisar'
}

function ImportarExtrato() {
  const [arquivo, setArquivo] = useState(null)
  const [textoExtraido, setTextoExtraido] = useState('')
  const [lancamentos, setLancamentos] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  async function selecionarArquivo(evento) {
    const selecionado = evento.target.files?.[0]

    if (!selecionado) return

    setErro('')
    setTextoExtraido('')
    setLancamentos([])
    setArquivo(null)

    const extensaoValida = /\.(xlsx|xls|csv)$/i.test(selecionado.name)

    if (!extensaoValida) {
      setErro('Selecione uma planilha Excel (.xlsx, .xls) ou CSV.')
      evento.target.value = ''
      return
    }

    setArquivo(selecionado)
    setCarregando(true)

    try {
      const dados = await selecionado.arrayBuffer()
      const workbook = XLSX.read(dados, {
        type: 'array',
        cellDates: true,
      })

      const planilha = workbook.Sheets[workbook.SheetNames[0]]

      if (!planilha) {
        throw new Error('Nenhuma planilha foi encontrada no arquivo.')
      }

      const linhas = XLSX.utils.sheet_to_json(planilha, {
        header: 1,
        defval: null,
        raw: true,
      })

      // Localiza os cabeçalhos da tabela.
      const indiceCabecalho = linhas.findIndex((linha) => {
        const colunas = linha.map((celula) =>
          normalizarTexto(celula ?? ''),
        )

        return (
          colunas.includes('data do lancamento') &&
          colunas.includes('descricao da transacao') &&
          colunas.includes('debito')
        )
      })

      if (indiceCabecalho === -1) {
        throw new Error(
          'Não encontramos as colunas Data do lançamento, Descrição da transação e Débito.',
        )
      }

      const cabecalhos = linhas[indiceCabecalho].map((celula) =>
        normalizarTexto(celula ?? ''),
      )

      const indiceData = cabecalhos.indexOf('data do lancamento')
      const indiceVeiculo = cabecalhos.indexOf('veiculo')
      const indiceDescricao = cabecalhos.indexOf('descricao da transacao')
      const indiceDebito = cabecalhos.indexOf('debito')

      // Filtra registros inválidos e observações que não são lançamentos.
      const registros = linhas
        .slice(indiceCabecalho + 1)
        .map((linha, indice) => ({
          linha,
          numeroLinha: indiceCabecalho + indice + 2,
        }))
        .filter(({ linha }) => {
          const textoLinha = normalizarTexto(
            linha
              .filter((celula) => celula !== null && celula !== undefined)
              .join(' '),
          )

          // Remove a observação fiscal, mesmo se estiver em outra coluna.
          if (
            textoLinha.includes('valor aproximado dos tributos') ||
            textoLinha.includes('responsabilidade pelo recolhimento')
          ) {
            return false
          }

          const data = linha[indiceData]

          return (
            data !== null &&
            data !== undefined &&
            String(data).trim() !== ''
          )
        })

      const resultado = registros.map(({ linha, numeroLinha }) => {
        const data = converterData(linha[indiceData])

        const veiculo =
          indiceVeiculo >= 0
            ? String(linha[indiceVeiculo] ?? '').trim()
            : ''

        const descricao = String(
          linha[indiceDescricao] ?? '',
        ).trim()

        // Os totais usam somente a coluna Débito.
        const valor = converterValor(linha[indiceDebito])

        const classificacao = classificarLancamento(
          descricao,
          valor,
        )

        return {
          data,
          veiculo: veiculo || 'Não identificado',
          descricao: descricao || 'Descrição não identificada',
          valor,
          classificacao,
          numeroLinha,
        }
      })

      const texto = resultado
        .map(
          (item) =>
            `${item.data} | Veículo: ${item.veiculo} | ${item.descricao} | Débito: ${item.valor === null ? 'vazio' : formatarMoeda(item.valor)
            } | Classificação: ${item.classificacao}`,
        )
        .join('\n')

      if (resultado.length === 0) {
        throw new Error('Nenhum lançamento foi encontrado na planilha.')
      }

      setTextoExtraido(texto)
      setLancamentos(resultado)
    } catch (erroLeitura) {
      console.error('Erro ao ler a planilha:', erroLeitura)
      setErro(
        erroLeitura.message ||
        'Não foi possível ler a planilha. Confira o arquivo e tente novamente.',
      )
    } finally {
      setCarregando(false)
    }
  }

  const totalMotorista = lancamentos
    .filter((item) => item.classificacao === 'Motorista')
    .reduce((total, item) => total + (item.valor ?? 0), 0)

  const totalEmpresa = lancamentos
    .filter((item) => item.classificacao === 'Empresa')
    .reduce((total, item) => total + (item.valor ?? 0), 0)

  const quantidadeRevisar = lancamentos.filter(
    (item) => item.classificacao === 'Revisar',
  ).length



  async function exportarExcel() {
    const workbook = new ExcelJS.Workbook()

    workbook.creator = 'Pedágio Fácil'
    workbook.subject = 'Extrato de pedágios ConectCar'
    workbook.created = new Date()

    // Aba de resumo
    const planilhaResumo = workbook.addWorksheet('Resumo')

    planilhaResumo.addRow(['Resumo do extrato ConectCar'])
    planilhaResumo.addRow(['Total do motorista', totalMotorista])
    planilhaResumo.addRow(['Total da empresa', totalEmpresa])
    planilhaResumo.addRow(['Lançamentos para revisão', quantidadeRevisar])
    planilhaResumo.addRow([
      'Total de lançamentos importados',
      lancamentos.length,
    ])

    planilhaResumo.mergeCells('A1:B1')

    planilhaResumo.getRow(1).font = {
      bold: true,
      size: 16,
      color: { argb: 'FFFFFFFF' },
    }

    planilhaResumo.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF6200EE' },
    }

    planilhaResumo.getColumn(1).width = 36
    planilhaResumo.getColumn(2).width = 24

    planilhaResumo.getCell('B2').numFmt = '"R$" #,##0.00'
    planilhaResumo.getCell('B3').numFmt = '"R$" #,##0.00'

    planilhaResumo.eachRow((linha, numero) => {
      if (numero > 1) {
        linha.getCell(1).font = { bold: true }
      }
    })


    // Aba de lançamentos
    const planilhaLancamentos = workbook.addWorksheet('Lançamentos')

    // Define a largura das colunas.
    planilhaLancamentos.columns = [
      { key: 'data', width: 25 },
      { key: 'veiculo', width: 20 },
      { key: 'descricao', width: 75 },
      { key: 'valor', width: 20 },
      { key: 'classificacao', width: 20 },
    ]

    // Cria uma tabela estruturada com filtros e linhas alternadas.
    planilhaLancamentos.addTable({
      name: 'TabelaLancamentos',
      ref: 'A1',
      headerRow: true,
      totalsRow: false,
      style: {
        theme: 'TableStyleMedium2',
        showRowStripes: true,
      },
      columns: [
        { name: 'Data do lançamento', filterButton: true },
        { name: 'Veículo', filterButton: true },
        { name: 'Descrição', filterButton: true },
        { name: 'Valor do débito', filterButton: true },
        { name: 'Classificação', filterButton: true },
      ],
      rows: lancamentos.map((item) => [
        item.data,
        item.veiculo,
        item.descricao,
        item.valor,
        item.classificacao,
      ]),
    })

    // Formata a coluna de valores como moeda brasileira.
    planilhaLancamentos.getColumn(4).numFmt = '"R$" #,##0.00'

    // Ativa a quebra automática de texto na coluna Descrição.
    for (let i = 2; i <= lancamentos.length + 1; i++) {
      const celula = planilhaLancamentos.getCell(i, 3)

      celula.alignment = {
        vertical: 'top',
        horizontal: 'left',
        wrapText: true,
      }

      // Ajusta a altura da linha conforme o tamanho da descrição.
      const descricao = String(celula.value ?? '')
      const linhasEstimadas = Math.ceil(descricao.length / 65)

      planilhaLancamentos.getRow(i).height = Math.max(
        20,
        Math.min(linhasEstimadas, 6) * 15,
      )
    }



    // Mantém o cabeçalho visível durante a rolagem.
    planilhaLancamentos.views = [
      { state: 'frozen', ySplit: 1 },
    ]

    // Ajusta a apresentação do cabeçalho.
    const cabecalho = planilhaLancamentos.getRow(1)

    cabecalho.height = 30
    cabecalho.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
    }
    cabecalho.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    }


    // Gera e baixa o arquivo.
    const dataArquivo = new Date().toISOString().slice(0, 10)
    const buffer = await workbook.xlsx.writeBuffer()

    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `pedagio-facil-conectcar-${dataArquivo}.xlsx`
    link.click()

    URL.revokeObjectURL(url)
  }



  return (
    <section
      className="importar-extrato"
      aria-labelledby="titulo-importacao"
    >
      <div className="importar-extrato__cabecalho">
        <span className="importar-extrato__icone" aria-hidden="true">
          XLS
        </span>

        <div>
          <h2 id="titulo-importacao">Importar extrato ConectCar</h2>
          <p>
            Selecione o extrato em Excel (.xlsx, .xls) ou CSV.
          </p>
        </div>
      </div>

      <label className="importar-extrato__seletor">
        <span>Escolher planilha</span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={selecionarArquivo}
          disabled={carregando}
        />
      </label>

      {arquivo && (
        <p className="importar-extrato__arquivo" role="status">
          Arquivo selecionado: <strong>{arquivo.name}</strong>
        </p>
      )}

      {carregando && <p role="status">Lendo a planilha, aguarde...</p>}
      {erro && <p role="alert">{erro}</p>}

      {lancamentos.length > 0 && (
        <div className="resultado-pdf">
          <h3>Resumo dos lançamentos identificados</h3>

          <button
            type="button"
            className="importar-extrato__botao-exportar"
            onClick={exportarExcel}
          >
            Exportar para Excel
          </button>

          <p>
            Total do motorista: <strong>{formatarMoeda(totalMotorista)}</strong>
          </p>
          <p>
            Total da empresa: <strong>{formatarMoeda(totalEmpresa)}</strong>
          </p>

          <p>
            Lançamentos para revisão:{' '}
            <strong>{quantidadeRevisar}</strong>
          </p>

          {quantidadeRevisar === 0 ? (
            <p className="importar-extrato__sucesso" role="status">
              Todos os lançamentos foram classificados automaticamente.
            </p>
          ) : (
            <p role="status">
              Existem {quantidadeRevisar}{' '}
              {quantidadeRevisar === 1
                ? 'lançamento pendente'
                : 'lançamentos pendentes'}{' '}
              de revisão.
            </p>
          )}


          <div className="tabela-lancamentos">
            <table>
              <thead>
                <tr>
                  <th>Data do lançamento</th>
                  <th>Veículo</th>
                  <th>Descrição</th>
                  <th>Valor do débito</th>
                  <th>Classificação</th>
                </tr>
              </thead>

              <tbody>
                {lancamentos.map((item) => (
                  <tr key={item.numeroLinha}>
                    <td>{item.data}</td>
                    <td>{item.veiculo}</td>
                    <td>{item.descricao}</td>
                    <td>
                      {item.valor === null
                        ? 'Sem débito'
                        : formatarMoeda(item.valor)}
                    </td>
                    <td>{item.classificacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details>
            <summary>Consultar dados importados</summary>
            <textarea
              aria-label="Dados importados da planilha"
              readOnly
              value={textoExtraido}
              rows={14}
            />
          </details>
        </div>
      )}
    </section>
  )
}

export default ImportarExtrato