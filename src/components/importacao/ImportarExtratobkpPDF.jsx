
import { useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import './ImportarExtrato.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

function normalizarTexto(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function converterValor(texto) {
  if (!texto) return null

  const valor = texto.match(/-?\s*R\$\s*([\d.]+,\d{2}|[\d]+\.\d{2})/)

  if (!valor) return null

  const numero = valor[1].includes(',')
    ? Number(valor[1].replace(/\./g, '').replace(',', '.'))
    : Number(valor[1])

  return Math.abs(numero)
}

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
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

    if (
      selecionado.type !== 'application/pdf' &&
      !selecionado.name.toLowerCase().endsWith('.pdf')
    ) {
      setErro('Selecione um arquivo PDF válido.')
      evento.target.value = ''
      return
    }

    setArquivo(selecionado)
    setCarregando(true)

    try {
      const dados = await selecionado.arrayBuffer()
      const documento = await pdfjsLib.getDocument({
        data: new Uint8Array(dados),
      }).promise

      const itensExtraidos = []
      let textoCompleto = ''

      for (
        let numeroPagina = 1;
        numeroPagina <= documento.numPages;
        numeroPagina++
      ) {
        const pagina = await documento.getPage(numeroPagina)
        const conteudo = await pagina.getTextContent()

        console.log(
          'Conteúdo extraído da página:',
          conteudo.items.filter((item) => 'str' in item)
        )

        console.log(
          'DIAGNÓSTICO PDF:',
          conteudo.items
            .filter((item) => 'str' in item && item.str.trim())
            .map((item) => ({
              texto: item.str,
              x: Math.round(item.transform[4]),
              y: Math.round(item.transform[5]),
            }))
            .filter((item) =>
              /ECOPISTAS|Recarga Vale Pedágio|14\/09\/2026|-R\$/.test(item.texto)
            ),
        )

        const itens = conteudo.items
          .filter((item) => 'str' in item && item.str.trim())
          .map((item) => ({
            texto: item.str.trim(),
            x: item.transform[4],
            y: item.transform[5],
            pagina: numeroPagina,
          }))

        itensExtraidos.push(...itens)

        console.log(
          'ITENS DA PÁGINA:',
          itensExtraidos
            .filter(
              (item) =>
                item.y >= 1160 &&
                item.y <= 1210 &&
                item.x >= 150,
            )
            .sort((a, b) => b.y - a.y || a.x - b.x)
            .map((item) => ({
              texto: item.texto,
              x: Math.round(item.x),
              y: Math.round(item.y),
            })),
        )

        const linhas = new Map()

        for (const item of itens) {
          const y = Math.round(item.y)

          if (!linhas.has(y)) linhas.set(y, [])

          linhas.get(y).push(item)
        }

        const textoPagina = [...linhas.entries()]
          .sort(([yA], [yB]) => yB - yA)
          .map(([, linha]) =>
            linha
              .sort((a, b) => a.x - b.x)
              .map((item) => item.texto)
              .join(' '),
          )
          .join('\n')

        textoCompleto += `Página ${numeroPagina}\n${textoPagina}\n\n`
      }

      if (!textoCompleto.trim()) {
        setErro('Não encontramos texto neste PDF.')
        return
      }



      // Localiza as datas dos lançamentos na coluna Data.
      const datasLancamentos = itensExtraidos
        .filter(
          (item) =>
            item.x < 110 &&
            /^\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}:\d{2}:\d{2}$/.test(
              item.texto,
            ),
        )
        .sort((a, b) => b.y - a.y)

      const resultado = []

      for (const data of datasLancamentos) {
        // Busca a descrição e o débito próximos da altura da data.
        // Uma diferença de até 3 pontos é aceita.
        const itensProximos = itensExtraidos.filter(
          (item) =>
            item.pagina === data.pagina &&
            Math.abs(item.y - data.y) <= 3,
        )

        console.log(
          'DIAGNÓSTICO LANÇAMENTO:',
          data.texto,
          itensExtraidos
            .filter(
              (item) =>
                item.pagina === data.pagina &&
                Math.abs(item.y - data.y) <= 12 &&
                (
                  (item.x >= 150 && item.x < 295) ||
                  (item.x >= 338 && item.x < 395)
                ),
            )
            .map((item) => ({
              texto: item.texto,
              x: Math.round(item.x),
              y: Math.round(item.y),
              diferencaY: Math.round(item.y - data.y),
            })),
        )


        const descricoes = itensProximos
          .filter((item) => item.x >= 150 && item.x < 295)
          .sort(
            (a, b) =>
              Math.abs(a.y - data.y) - Math.abs(b.y - data.y),
          )

        const itemDebito = itensProximos
          .filter((item) => item.x >= 338 && item.x < 395)
          .sort(
            (a, b) =>
              Math.abs(a.y - data.y) - Math.abs(b.y - data.y),
          )[0]

        const descricao = descricoes[0]?.texto ?? ''
        const descricaoNormalizada = normalizarTexto(descricao)
        const valor = converterValor(itemDebito?.texto)

        let classificacao = 'Revisar'

        if (
          descricaoNormalizada.includes('recarga') ||
          descricaoNormalizada.includes('estacionamento')
        ) {
          classificacao = 'Ignorar'
        } else if (
          descricaoNormalizada.includes('passagem com vale pedagio')
        ) {
          classificacao = valor !== null ? 'Empresa' : 'Revisar'
        } else if (
          valor !== null &&
          /(motiva|rota das bandeiras|minas|freeflow|ecopistas)/i.test(
            descricaoNormalizada,
          )
        ) {
          classificacao = 'Cliente'
        }

        resultado.push({
          data: data.texto,
          descricao: descricao || 'Descrição não identificada',
          descricaoNormalizada,
          valor,
          pagina: data.pagina,
          classificacao,
        })
      }

      setTextoExtraido(textoCompleto)
      setLancamentos(resultado)


    } catch (erroLeitura) {
      console.error('Erro ao ler o PDF:', erroLeitura)
      setErro('Não foi possível ler o PDF. Tente selecionar o arquivo novamente.')
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

  return (
    <section className="importar-extrato" aria-labelledby="titulo-importacao">
      <div className="importar-extrato__cabecalho">
        <span className="importar-extrato__icone" aria-hidden="true">
          PDF
        </span>

        <div>
          <h2 id="titulo-importacao">Importar extrato</h2>
          <p>Selecione o extrato de pedágios em formato PDF.</p>
        </div>
      </div>

      <label className="importar-extrato__seletor">
        <span>Escolher arquivo PDF</span>
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={selecionarArquivo}
          disabled={carregando}
        />
      </label>

      {arquivo && (
        <p className="importar-extrato__arquivo" role="status">
          Arquivo selecionado: <strong>{arquivo.name}</strong>
        </p>
      )}

      {carregando && <p role="status">Lendo o PDF, aguarde...</p>}
      {erro && <p role="alert">{erro}</p>}

      {lancamentos.length > 0 && (
        <div className="resultado-pdf">
          <h3>Resumo dos lançamentos identificados</h3>

          <p>
            Total do cliente: <strong>{formatarMoeda(totalCliente)}</strong>
          </p>
          <p>
            Total da empresa: <strong>{formatarMoeda(totalEmpresa)}</strong>
          </p>
          <p>
            Lançamentos para revisão: <strong>{quantidadeRevisar}</strong>
          </p>

          <div className="tabela-lancamentos">
            <table>
              <thead>
                <tr>
                  <th>Data do lançamento</th>
                  <th>Descrição</th>
                  <th>Valor do débito</th>
                  <th>Classificação</th>
                </tr>
              </thead>
              <tbody>
                {lancamentos.map((item, indice) => (
                  <tr key={`${item.pagina}-${item.data}-${indice}`}>
                    <td>{item.data}</td>
                    <td>{item.descricao || 'Descrição não identificada'}</td>
                    <td>
                      {item.valor === null
                        ? 'Não identificado'
                        : formatarMoeda(item.valor)}
                    </td>
                    <td>{item.classificacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details>
            <summary>Consultar texto extraído do PDF</summary>
            <textarea
              aria-label="Texto extraído do PDF"
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
