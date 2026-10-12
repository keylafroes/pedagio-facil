import { useState } from 'react'
import * as XLSX from 'xlsx'
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
    return 'Cliente'
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

  const totalCliente = lancamentos
    .filter((item) => item.classificacao === 'Cliente')
    .reduce((total, item) => total + (item.valor ?? 0), 0)

  const totalEmpresa = lancamentos
    .filter((item) => item.classificacao === 'Empresa')
    .reduce((total, item) => total + (item.valor ?? 0), 0)

  const quantidadeRevisar = lancamentos.filter(
    (item) => item.classificacao === 'Revisar',
  ).length


  function exportarExcel() {
    const dadosResumo = [
      ['Resumo do extrato ConectCar'],
      ['Total do cliente', totalCliente],
      ['Total da empresa', totalEmpresa],
      ['Lançamentos para revisão', quantidadeRevisar],
      ['Total de lançamentos importados', lancamentos.length],
    ]

    const dadosLancamentos = lancamentos.map((item) => ({
      'Data do lançamento': item.data,
      Veículo: item.veiculo,
      Descrição: item.descricao,
      'Valor do débito': item.valor,
      Classificação: item.classificacao,
    }))

    const planilhaResumo = XLSX.utils.aoa_to_sheet(dadosResumo)
    const planilhaLancamentos = XLSX.utils.json_to_sheet(dadosLancamentos)

    // Formata os totais como moeda brasileira no Excel.
    planilhaResumo['B2'].z = '"R$" #,##0.00'
    planilhaResumo['B3'].z = '"R$" #,##0.00'

    // Formata os valores dos débitos.
    const intervalo = XLSX.utils.decode_range(
      planilhaLancamentos['!ref'],
    )

    for (let linha = 1; linha <= intervalo.e.r; linha++) {
      const celula = planilhaLancamentos[`D${linha + 1}`]

      if (celula && typeof celula.v === 'number') {
        celula.z = '"R$" #,##0.00'
      }
    }

    // Ajusta a largura das colunas da tabela.
    planilhaLancamentos['!cols'] = [
      { wch: 24 },
      { wch: 18 },
      { wch: 75 },
      { wch: 18 },
      { wch: 18 },
    ]

    planilhaResumo['!cols'] = [
      { wch: 36 },
      { wch: 22 },
    ]

    const workbook = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(
      workbook,
      planilhaResumo,
      'Resumo',
    )

    XLSX.utils.book_append_sheet(
      workbook,
      planilhaLancamentos,
      'Lançamentos',
    )

    const dataArquivo = new Date().toISOString().slice(0, 10)

    XLSX.writeFile(
      workbook,
      `pedagio-facil-conectcar-${dataArquivo}.xlsx`,
    )
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
            Total do cliente: <strong>{formatarMoeda(totalCliente)}</strong>
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