# Nexo Governamental · site e painel editorial

Site institucional e blog do Nexo Governamental XI de Agosto, organização estudantil da Faculdade de Direito da USP, com painel em **React + Tailwind CSS**, API em **Node.js 24 + Fastify** e persistência em **SQLite**. A equipe mantém o processo seletivo, os canais de contato e os artigos em `/admin`.

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

## Painel essencial

O painel tem quatro áreas: **Visão geral**, **Processo seletivo**, **Blog do Nexo** e **Contato**. A visão geral reúne os atalhos e o estado das alterações. A edição do site se concentra no que a equipe precisa atualizar com frequência:

- **Processo seletivo:** edição, situação das inscrições, abertura e encerramento, link do formulário, edital por link ou envio de PDF e etapas do cronograma com nome, data e orientações.
- **Contato:** e-mail, endereço do perfil e nome de usuário do Instagram.
- **Blog do Nexo:** criação e edição completa dos artigos, com capas, rascunhos, prévia e publicação.

Os títulos e textos institucionais, as imagens principais, os projetos, a visibilidade das seções e a estrutura da página ficam fixos. Esses campos também são protegidos pela API; não podem ser alterados por uma requisição direta ao antigo editor. Os conteúdos e arquivos existentes são preservados. A fonte dos textos institucionais é `shared/content.cjs`; quando ela muda, a atualização explícita descrita em **Conteúdo institucional fixo** sincroniza o banco sem substituir o processo seletivo, os contatos ou os artigos. Alterações de apresentação continuam no código do site.

Para atualizar o processo seletivo ou os contatos:

1. Edite os campos da área correspondente.
2. Salve o rascunho e confira **Pré-visualizar**.
3. Use **Publicar alterações** e confirme para atualizar o site deste ambiente.

O rascunho é separado do conteúdo publicado. O site consulta apenas a versão publicada. O modelo inicial preserva os conteúdos existentes e mantém as inscrições encerradas até a equipe revisar e publicar uma nova edição. Publicar com a situação “Inscrições abertas” exige um link de inscrição válido. Quando houver datas, o site mostra “Em breve” antes da abertura, libera o botão dentro do período e encerra as inscrições depois do prazo, seguindo o horário de Brasília. A situação “Em breve” escolhida manualmente permanece assim até uma nova publicação.

As etapas cadastradas substituem a imagem antiga do cronograma quando são publicadas. Se todas as etapas forem removidas depois, o site deixa de exibir o cronograma; a imagem antiga não volta automaticamente.

O edital pode ser enviado diretamente na página do processo seletivo. A biblioteca de capas fica dentro do editor do blog, sem uma área separada de gerenciamento do site. Os uploads aceitam imagens PNG, JPEG, WebP e AVIF, além de PDFs, com limite de 8 MB por arquivo. As imagens são decodificadas e verificadas antes de salvar; imagens corrompidas ou animadas, maiores que 40 megapixels ou com dimensão acima de 16.000 pixels são recusadas. A versão pública é convertida para WebP com dimensão máxima de 2.400 pixels; o original permanece privado em `originals/`. Os arquivos enviados recebem uma URL pública; envie apenas materiais destinados ao site. O registro interno das alterações permanece no banco, sem oferecer restauração de versões do site no painel simplificado.

O menu de aparência, no topo do painel e na tela de acesso, oferece os temas Claro, Escuro e Sistema. O tema Escuro é o padrão para novos acessos; as escolhas salvas de Claro ou Sistema são respeitadas. A escolha fica salva neste navegador e acompanha as outras abas abertas. O modo Sistema segue a preferência do dispositivo. Essa escolha altera apenas o painel; o site público mantém a própria identidade visual. A busca do painel também pode ser aberta com `⌘ K` ou `Ctrl K`.

## Blog

Abra **Blog do Nexo** no painel para criar artigos, acompanhar rascunhos e gerenciar publicações. Cada artigo tem título, endereço, resumo, categoria, autoria, descrição da autoria, imagem de capa com descrição e crédito, palavras-chave e opção de destaque.

1. Crie um artigo e escreva no editor visual, com títulos, listas, citações e links. O modo Markdown continua disponível nas opções avançadas e preserva conteúdos que o editor visual não suporta.
2. Salve o rascunho. O botão **Prévia** também salva as alterações antes de abrir a visualização privada, com opções de computador e celular. Visitantes continuam vendo somente o que foi publicado.
3. Revise texto, fontes, autoria, créditos e endereço, e confirme a publicação. Artigos publicados aparecem em `/blog/` e têm uma página própria em `/blog/endereco-do-artigo`.
4. Para atualizar um artigo publicado, edite e salve o rascunho, confira a prévia e publique novamente. A versão pública anterior permanece disponível até essa confirmação.
5. Retire uma publicação do ar quando necessário. Arquivar organiza os artigos fora da lista ativa; restaurar devolve o artigo como rascunho, sem republicá-lo automaticamente.

O blog público tem busca, filtro por categoria e paginação. O servidor entrega o conteúdo completo das páginas, incluindo título, descrição e endereço canônico, sem depender de JavaScript para a leitura. O Markdown não executa HTML e restringe os protocolos de links; a prévia exige uma sessão administrativa. No editor, `⌘ S` ou `Ctrl S` salva o rascunho. O painel salva rascunhos automaticamente após a edição válida e mantém uma cópia de recuperação neste navegador, quando o armazenamento local está disponível. Publicar sempre exige revisão e confirmação. O histórico do artigo permite recuperar versões anteriores sem alterar a publicação no ar; mudanças simultâneas e recuperação de cópias antigas exigem revisão.

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

| Variável                    | Configuração                                                               |
| --------------------------- | -------------------------------------------------------------------------- |
| `NODE_ENV`                  | `production`                                                               |
| `HOST`                      | `0.0.0.0` em contêiner; `127.0.0.1` se o proxy estiver no mesmo servidor   |
| `PORT`                      | `3001`, por padrão                                                         |
| `DATA_DIR`                  | Caminho do armazenamento persistente; padrão `./data`                      |
| `CMS_ORIGIN`                | Origem HTTPS exata do site, sem barra final, incluindo a porta caso exista |
| `ADMIN_NAME`                | Nome exibido no painel; padrão `Equipe Nexo`                               |
| `ADMIN_EMAIL`               | E-mail do administrador inicial                                            |
| `ADMIN_PASSWORD`            | Senha exclusiva e forte, com no mínimo 12 caracteres                       |
| `CMS_LOCAL_PREVIEW`         | `0`                                                                        |
| `CMS_TRUST_PROXY`           | Lista de IPs/CIDRs específicos do proxy reverso; vazio para acesso direto  |
| `CMS_BACKUP_DIR`            | Destino privado dos backups; padrão `DATA_DIR/backups`                     |
| `CMS_BACKUP_INTERVAL_HOURS` | Intervalo em produção: `24` por padrão, de `1` a `168`; `0` desativa       |
| `CMS_BACKUP_KEEP`           | Quantidade de backups retidos; padrão `14`                                 |

As variáveis `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `ADMIN_NAME` configuram o administrador inicial. As contas adicionais são individuais, com papéis de administrador ou editor, e ficam no banco com senha protegida por scrypt. O administrador gerencia os acessos; desativar uma conta revoga suas sessões. Cada integrante deve usar seu próprio acesso.

Alterar as credenciais iniciais no ambiente e reiniciar sincroniza apenas a conta inicial e invalida suas sessões. Uma senha trocada pelo próprio usuário continua válida após reiniciar enquanto as variáveis iniciais permanecerem iguais. A aplicação recusa iniciar em produção sem credenciais e origem HTTPS, ou com a prévia local habilitada.

Configure `CMS_TRUST_PROXY` somente com os IPs/CIDRs exatos do proxy usado pelo provedor. Deixe vazio para acesso direto; não use confiança irrestrita. Isso permite aplicar limites de tentativa de acesso ao endereço correto. Confira essa configuração na hospedagem real antes de liberar o painel.

O modo de produção serve o site, o painel, a API e os uploads na mesma origem:

```sh
npm run build
NODE_ENV=production npm start
```

Consulte `.env.example` para os nomes das configurações. Não adicione `.env`, senhas, banco de dados ou uploads ao Git.

### Docker

O `Dockerfile` usa Node.js 24, gera os arquivos de interface em uma etapa separada e executa a aplicação com usuário sem privilégios administrativos. O diretório `/app/data` é o volume persistente, incluindo banco, mídia original e backups; a porta do contêiner é `3001`. O healthcheck consulta `/api/health` sem autenticação.

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

Mantenha `DATA_DIR` em um volume persistente. Ele contém `nexo.sqlite`, `uploads/`, `originals/` e, por padrão, `backups/`. Os originais e os backups são privados; apenas `uploads/` é servido na web. Não publique esse diretório como uma pasta estática e não o inclua no Git.

O processo de produção faz a primeira cópia após 60 segundos e depois a cada 24 horas. Cada execução cria um snapshot consistente do SQLite, copia uploads e originais e verifica o banco e o SHA-256 de cada arquivo. O diretório final só aparece depois da verificação. O padrão retém as 14 cópias mais recentes; a limpeza atua apenas em diretórios reconhecidos como backups criados pelo próprio Nexo. Falhas são registradas nos logs. Em desenvolvimento, o agendamento fica desligado.

Também é possível criar uma cópia com a aplicação em execução:

```sh
npm run backup
# Destino e retenção explícitos:
npm run backup -- --data-dir ./data --output-root ./data/backups --keep 14
```

O resultado informa o diretório, a data, a quantidade de arquivos e os bytes copiados, sem imprimir credenciais. Um arquivo `.nexo-backup.lock` impede duas cópias simultâneas no mesmo destino. Se um encerramento abrupto deixar esse arquivo, confira que não há backup em execução antes de removê-lo e repetir o comando.

Os backups no mesmo volume ajudam a recuperar erros de edição; a perda desse volume afeta também essas cópias. Prepare uma cópia periódica para outro armazenamento privado, de preferência com retenção e controle de acesso. A aplicação não contrata nem envia dados a serviços externos automaticamente.

A restauração verifica tudo por padrão, sem gravar dados:

```sh
npm run restore:backup -- --backup ./data/backups/NOME-DO-BACKUP
```

Para um ensaio de recuperação ou uma recuperação real, escolha um diretório novo ou vazio:

```sh
npm run restore:backup -- --backup ./data/backups/NOME-DO-BACKUP --destination ./data-restored --apply
```

O comando recusa substituir um diretório com dados, verifica as cópias e revoga as sessões restauradas. Usuários, artigos, histórico, rascunhos e arquivos são preservados; cada pessoa entra novamente com sua senha. Para colocar a recuperação em uso, pare a aplicação e aponte `DATA_DIR` para o diretório restaurado. Guarde o diretório anterior até conferir conteúdo, imagens, edital e acesso. O teste automatizado de recuperação usa apenas pastas temporárias e nunca o banco de desenvolvimento.

### Conteúdo institucional fixo

Edite `shared/content.cjs` para alterar a fonte dos títulos, textos e imagens institucionais. O banco publicado não é substituído automaticamente em reinícios ou builds. Para revisar quais campos fixos mudariam:

```sh
npm run content:institutional
```

O comando apenas lista os caminhos dos campos alterados. O processo seletivo e os contatos publicados permanecem com os dados atuais; o rascunho mantém suas próprias edições operacionais. Os artigos e arquivos não são alterados. Após revisar o relatório e aprovar a atualização institucional, execute explicitamente:

```sh
npm run content:institutional -- --apply
```

A aplicação cria e verifica um backup antes de gravar, usa uma transação e registra a atualização no histórico interno. Se o conteúdo mudar em outra sessão durante a preparação, a operação é cancelada para nova revisão. Esse comando altera diretamente a parte institucional publicada do ambiente selecionado; não o use como etapa automática de deploy.

### Verificação antes de liberar à equipe

```sh
npm run check:readiness -- --url http://127.0.0.1:3001
# No ambiente de produção, com suas variáveis configuradas:
npm run check:readiness -- --production --url https://SEU-DOMINIO
```

A verificação consulta saúde da API, conteúdo público, blog e painel; confere o build e, em produção, a origem HTTPS, a desativação da prévia local, as credenciais iniciais e a configuração de backups. Não exibe senhas. Um retorno positivo comprova essas verificações, mas ainda exige validar persistência, recuperação, contas e monitoramento na hospedagem real. Consulte `GO_LIVE_STATUS.md` para os critérios de liberação.
