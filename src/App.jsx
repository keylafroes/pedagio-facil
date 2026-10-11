
import './App.css'
import ImportarExtrato from './components/importacao/ImportarExtrato'

function App() {
  return (
    <main className="app">
      <header className="cabecalho">
        <a className="marca" href="#inicio">
          <span className="marca-icone">PF</span>
          <span>Pedágio Fácil</span>
        </a>

        <span className="selo">Controle de despesas</span>
      </header>

      <section className="apresentacao" id="inicio">
        <p className="sobretitulo">ORGANIZE SUAS DESPESAS</p>

        <h1>
          Seus pedágios,
          <br />
          <span>mais organizados.</span>
        </h1>

        <p className="descricao">
          Confira os pedágios pagos por você, separe os valores
          custeados pela empresa e prepare sua planilha de reembolso.
        </p>

        <div className="aviso">
          <span aria-hidden="true">ⓘ</span>
          <p>
            Esta é a primeira versão do sistema. A importação e
            leitura dos extratos serão implementadas nas próximas etapas.
          </p>
        </div>

        <div className="acoes">
          <button className="botao-principal" type="button" disabled>
            Importar extrato
          </button>
          <span className="status">Em desenvolvimento</span>
        </div>
      </section>

      <section className="recursos" aria-label="Recursos planejados">
        <article className="cartao">
          <span className="cartao-icone">01</span>
          <h2>Organize</h2>
          <p>Visualize as informações das passagens em uma única tela.</p>
        </article>

        <article className="cartao">
          <span className="cartao-icone">02</span>
          <h2>Confira</h2>
          <p>Diferencie os pedágios pagos pelo motorista dos custeados pela empresa.</p>
        </article>

        <article className="cartao">
          <span className="cartao-icone">03</span>
          <h2>Exporte</h2>
          <p>Prepare uma planilha para facilitar a prestação de contas.</p>
        </article>
      </section>

      <ImportarExtrato />

      <footer className="rodape">
        <p>Pedágio Fácil · Projeto acadêmico de extensão universitária</p>
      </footer>
    </main>
  )
}

export default App
