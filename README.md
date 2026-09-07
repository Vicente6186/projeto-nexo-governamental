# Nexo Governamental · site e painel editorial

Site institucional e blog do Nexo Governamental XI de Agosto, organização estudantil da Faculdade de Direito da USP, com painel em **React + Tailwind CSS**, API em **Node.js 24 + Fastify** e persistência em **SQLite**. A equipe edita o site e os artigos em `/admin`.

## Rodar no computador

Requisito: Node.js 24 ou superior, com npm.

```sh
npm ci
cp .env.example .env
```

Para conhecer o painel localmente, defina `CMS_LOCAL_PREVIEW=1` no arquivo `.env` e execute:

```sh
npm run dev
```

- Site: <http://127.0.0.1:8080/>
- Blog: <http://127.0.0.1:8080/blog/>
- Painel: <http://127.0.0.1:8080/admin/>
- API: <http://127.0.0.1:3001/>

O Webpack atende a interface na porta 8080 e encaminha `/api`, `/uploads` e `/blog` para o Fastify na porta 3001. Os dois processos iniciam juntos. A prévia local permite avaliar o editor sem configurar credenciais; mantenha-a restrita ao computador de desenvolvimento.

## Fluxo editorial

1. Edite os títulos, descrições, textos complementares, itens e visibilidade das seções.
2. No processo seletivo, atualize a edição, a situação das inscrições, as datas, o edital, o link de inscrição e o cronograma.
3. Salve o rascunho e confira a prévia antes de publicar.
4. Publique para disponibilizar o conteúdo no site. O histórico permite recuperar uma versão anterior como rascunho para revisão.

O rascunho é separado do conteúdo publicado. O site consulta apenas a versão publicada. O modelo inicial preserva os conteúdos existentes e mantém as inscrições encerradas até a equipe revisar e publicar uma nova edição. Publicar com a situação “Inscrições abertas” exige um link de inscrição válido. Quando houver datas, o site mostra “Em breve” antes da abertura, libera o botão dentro do período e encerra as inscrições depois do prazo, seguindo o horário de Brasília. A situação “Em breve” escolhida manualmente permanece assim até uma nova publicação.

O painel inclui biblioteca de arquivos e configurações institucionais. Os uploads aceitam imagens PNG, JPEG, WebP e AVIF, além de PDFs, com limite de 8 MB por arquivo. Os arquivos enviados recebem uma URL pública; use a biblioteca apenas para materiais destinados ao site.

O menu de aparência, no topo do painel e na tela de acesso, oferece os temas Claro, Escuro e Sistema. A escolha fica salva neste navegador e acompanha as outras abas abertas. O modo Sistema segue a preferência do dispositivo. Essa escolha altera apenas o painel; o site público mantém a própria identidade visual. A busca do painel também pode ser aberta com `⌘ K` ou `Ctrl K`.

## Blog

Abra **Blog do Nexo** no painel para criar artigos, acompanhar rascunhos e gerenciar publicações. Cada artigo tem título, endereço, resumo, categoria, autoria, descrição da autoria, imagem de capa com descrição e crédito, palavras-chave e opção de destaque.

1. Crie um artigo e escreva o texto em Markdown. O editor permite conferir títulos, listas, citações, links e imagens antes da publicação.
2. Salve o rascunho. O botão **Prévia** também salva as alterações antes de abrir a visualização privada, com opções de computador e celular. Visitantes continuam vendo somente o que foi publicado.
3. Revise texto, fontes, autoria, créditos e endereço, e confirme a publicação. Artigos publicados aparecem em `/blog/` e têm uma página própria em `/blog/endereco-do-artigo`.
4. Para atualizar um artigo publicado, edite e salve o rascunho, confira a prévia e publique novamente. A versão pública anterior permanece disponível até essa confirmação.
5. Retire uma publicação do ar quando necessário. Arquivar organiza os artigos fora da lista ativa; restaurar devolve o artigo como rascunho, sem republicá-lo automaticamente.

O blog público tem busca, filtro por categoria e paginação. O servidor entrega o conteúdo completo das páginas, incluindo título, descrição e endereço canônico, sem depender de JavaScript para a leitura. O Markdown não executa HTML e restringe os protocolos de links; a prévia exige uma sessão administrativa. No editor, `⌘ S` ou `Ctrl S` salva o rascunho. O painel avisa antes de sair com alterações não salvas e preserva o texto local se outra sessão salvar uma versão mais recente.

No modo `CMS_LOCAL_PREVIEW=1`, o banco recebe três **rascunhos demonstrativos**, identificados no próprio texto. Eles ajudam a avaliar o layout e o fluxo editorial; não são publicações institucionais aprovadas e não aparecem para visitantes. Em produção não são criados artigos de exemplo. Publicar no ambiente local altera apenas esse ambiente; não envia conteúdo para uma hospedagem externa.

## Estrutura

| Caminho                                 | Responsabilidade                                    |
| --------------------------------------- | --------------------------------------------------- |
| `src/index.html`, `src/css/`, `src/js/` | Site público e integração com o conteúdo publicado  |
| `src/admin/`                            | Painel em React e Tailwind                          |
| `src/blog/`, `server/blog-pages.cjs`    | Estilos, leitura e páginas públicas do blog         |
| `shared/content.cjs`                    | Conteúdo inicial e campos editoriais compartilhados |
| `shared/blog.cjs`                       | Modelo, categorias, validação e Markdown do blog    |
| `server/`                               | API Fastify, autenticação, validação e persistência |
| `data/`                                 | Banco SQLite e imagens enviadas; não versionar      |
| `dist/`                                 | Saída do build, servida pelo Fastify em produção    |

## Build e verificações

```sh
npm test
npm run build
npm run test:e2e
```

Os testes de navegador usam Playwright. Se o Chromium ainda não estiver instalado, execute `npx playwright install chromium`. Execute `npm run build` antes dos testes: o Playwright inicia o Fastify na porta 3101 para servir o site e o painel compilados, com um banco temporário separado. Essa instância não reutiliza nem altera a aplicação de desenvolvimento das portas 8080 e 3001. Os testes automatizados e o build verificam a implementação local; a configuração de uma hospedagem real é uma etapa separada.

## Uso pela equipe

O painel precisa de um servidor Node.js com armazenamento persistente. A configuração atual do Netlify publica somente `dist`; ela não executa esta API Fastify. Para usar o editor com a equipe, publique a aplicação Node completa em uma hospedagem adequada, com HTTPS, credenciais próprias e volume persistente. Nenhuma infraestrutura pública é ativada por este projeto automaticamente.

Prepare o `.env` do ambiente de destino:

| Variável            | Configuração                                                               |
| ------------------- | -------------------------------------------------------------------------- |
| `NODE_ENV`          | `production`                                                               |
| `HOST`              | `0.0.0.0` em contêiner; `127.0.0.1` se o proxy estiver no mesmo servidor   |
| `PORT`              | `3001`, por padrão                                                         |
| `DATA_DIR`          | Caminho do armazenamento persistente; padrão `./data`                      |
| `CMS_ORIGIN`        | Origem HTTPS exata do site, sem barra final, incluindo a porta caso exista |
| `ADMIN_NAME`        | Nome exibido no painel; padrão `Equipe Nexo`                               |
| `ADMIN_EMAIL`       | E-mail do acesso administrativo                                            |
| `ADMIN_PASSWORD`    | Senha exclusiva e forte, com no mínimo 12 caracteres                       |
| `CMS_LOCAL_PREVIEW` | `0`                                                                        |

Há um acesso administrativo configurado por ambiente. Trocar o e-mail ou a senha e reiniciar o servidor invalida as sessões anteriores. A aplicação recusa iniciar em produção sem credenciais e origem HTTPS, ou com a prévia local habilitada.

O modo de produção serve o site, o painel, a API e os uploads na mesma origem:

```sh
npm run build
NODE_ENV=production npm start
```

Consulte `.env.example` para os nomes das configurações. Não adicione `.env`, senhas, banco de dados ou uploads ao Git.

### Docker

O `Dockerfile` usa Node.js 24, gera os arquivos de interface em uma etapa separada e executa a aplicação com usuário sem privilégios administrativos. O diretório `/app/data` é o volume persistente e a porta do contêiner é `3001`.

```sh
docker build -t nexo-governamental .
docker volume create nexo-data
docker run --rm --name nexo \
  --env-file .env \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e PORT=3001 \
  -e DATA_DIR=/app/data \
  -e CMS_LOCAL_PREVIEW=0 \
  -p 127.0.0.1:3001:3001 \
  -v nexo-data:/app/data \
  nexo-governamental
```

Use um `.env` preparado para produção. Configure o domínio HTTPS e o encaminhamento da porta no ambiente de hospedagem. O exemplo expõe a porta somente no computador local.

### Persistência e backup

Mantenha todo o diretório de dados em disco persistente, incluindo o SQLite e os uploads. Um novo contêiner sem esse volume inicia um armazenamento novo. Para um backup simples e consistente, pare a aplicação, copie o diretório de dados inteiro para outro local e só então reinicie. Com o servidor ativo, use um backup consistente do SQLite, incluindo as imagens, em vez de copiar somente o arquivo principal do banco durante escritas. Teste a restauração antes de depender do backup.
