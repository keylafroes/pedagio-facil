
import { useState } from 'react'
import './ImportarExtrato.css'

function ImportarExtrato() {
  const [arquivo, setArquivo] = useState(null)

  function selecionarArquivo(evento) {
    const selecionado = evento.target.files?.[0]

    if (!selecionado) return

    if (selecionado.type !== 'application/pdf') {
      alert('Selecione um arquivo PDF.')
      evento.target.value = ''
      return
    }

    setArquivo(selecionado)
  }

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
        />
      </label>

      {arquivo && (
        <p className="importar-extrato__arquivo" role="status">
          Arquivo selecionado: <strong>{arquivo.name}</strong>
        </p>
      )}
    </section>
  )
}

export default ImportarExtrato
