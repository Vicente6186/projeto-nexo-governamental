# Estado de entrega · Nexo Governamental

Data desta revisão: 7 de setembro de 2026.

O repositório contém a aplicação completa do site, painel e blog. A validação local não representa liberação pública para a equipe. Nenhuma hospedagem paga, novo domínio ou publicação externa é ativada por estes scripts.

## Validação da versão final

- `npm test`: 114 testes passaram, cobrindo API, usuários, publicação, imagens, recuperação, editor, temas, redefinição de senha e operação.
- `npm run test:e2e`: 47 cenários passaram no Chromium, incluindo publicação e prévias, capas, versões, recuperação entre abas, renovação de sessão, Desfazer entre etapas, teclado, temas, telas estreitas, cadastro de integrante em etapas e troca/redefinição de senha.
- `npm run build`: concluído; permanecem avisos de tamanho dos vídeos/imagens institucionais e dos pacotes JavaScript. O editor visual é carregado apenas ao abrir um artigo.
- `npm audit --omit=dev`: nenhuma vulnerabilidade reportada.
- `npm run check:readiness -- --url http://127.0.0.1:3001`: seis verificações locais passaram; `publicGoLiveConfirmed` permanece `false`.
- Na revisão anterior, a imagem Docker foi reconstruída e executada em Linux ARM64 com Node 24.20.0, `NODE_ENV=production`, conta fictícia e volume temporário isolado. Foram confirmados login, acesso demonstrativo desabilitado, rotas públicas, salvamento, conversão de PNG para WebP de 2.400 px, persistência após reiniciar o contêiner, backup e restauração em outro diretório. O contêiner de teste foi encerrado; nenhum serviço público foi ativado. A integração de e-mail desta revisão foi exercitada com transporte simulado, conforme detalhado abaixo.
- A revisão não publicou nem substituiu conteúdo no banco de desenvolvimento. Na conferência final, o rascunho estava na versão 4, com alteração no status do processo seletivo; a publicação permaneceu na versão 1 e com o hash anterior. Os três artigos continuavam na versão 1, sem publicação. Os testes de escrita usaram bancos temporários isolados.

## Formulários simplificados

- Artigos: quatro etapas, **Informações**, **Texto**, **Capa** e **Revisão**, com navegação livre, rascunho e prévia disponíveis durante todo o preenchimento. O editor permanece montado entre etapas, preservando o conteúdo e o histórico de Desfazer.
- Processo seletivo: **Inscrições**, **Documentos** e **Cronograma**. As orientações opcionais ficam recolhidas, abrem quando precisam de correção e permanecem abertas enquanto a pessoa corrige o campo. Contato continua em uma tela curta.
- Acessos: cadastro em **Pessoa** e **Permissões e senha**, com criação apenas na ação final. Alteração de senha recolhida, acessível por teclado e com confirmação visível após salvar.
- A revisão do artigo inclui erros conhecidos da API, como endereço já ocupado. Respostas de erro que chegam depois de o campo ter sido corrigido não bloqueiam a edição atual. Corrigir uma pendência abre a etapa e o campo correspondentes. Os testes conferem preservação ao voltar, foco após erros, navegação por teclado e ausência de transbordamento em telas de 320, 390 e 768 px nos temas claro e escuro.
- Build de produção e os 161 testes automatizados passaram nesta versão. A interface local respondeu HTTP 200. Esta revisão não realizou publicação externa nem migração de hospedagem; a arquitetura React/Fastify/Node existente foi preservada.

## Preparação para acesso autenticado e produção

- O acesso de demonstração fica desabilitado por configuração; as prévias editoriais continuam privadas e disponíveis após login. Desabilitar esse acesso não publica nem apaga rascunhos existentes.
- A configuração local foi atualizada para `CMS_LOCAL_PREVIEW=0`. A tela de login foi conferida no navegador, sem o bloco de apresentação; `/api/local-session` retornou 404 e os dados administrativos exigiram autenticação. A conta ativa de Vicente foi preservada.
- Sessões antigas de demonstração são removidas quando esse acesso é desativado. O teste de regressão confirmou que reativar o modo futuramente não recupera esses cookies, preservando as sessões das contas individuais.
- `compose.production.yml` fixa o modo de produção e desabilita o acesso demonstrativo, usa o Dockerfile existente e mantém os dados em um volume nomeado. A porta é exposta somente no loopback do servidor.
- A configuração Compose foi validada com valores fictícios em um diretório temporário, inclusive a precedência das variáveis, a restrição de porta e o volume persistente. Nenhum serviço foi iniciado pelo Compose.
- `deploy/production.env.example` é um modelo sem senha e sem domínio escolhido. A cópia preenchida `.env.production`, os diretórios de recuperação e os backups ficam fora do Git e do contexto de build.
- A precedência do ambiente foi comprovada em subprocesso isolado: `NODE_ENV=production` e `CMS_LOCAL_PREVIEW=0` já definidos não são substituídos por um arquivo `.env` com outros valores.
- O readiness de produção verifica a origem exata, a sintaxe dos proxies confiáveis e `/api/session`, recusando acesso demonstrativo ou uma sessão aberta sem autenticação.
- Nenhum `compose up`, alteração de domínio ou nova infraestrutura foi executado na preparação deste kit. Hospedagem, TLS e publicação continuam dependendo do destino escolhido.

## Recuperação por e-mail

O projeto inclui recuperação de senha por Resend, com link de uso único, validade de 30 minutos e revogação das sessões anteriores. A disponibilidade depende de configuração válida; sem ela, o pedido informa indisponibilidade em vez de simular um envio.

Os exemplos mantêm a chave e o remetente vazios, com limite local de 20 mensagens por dia UTC, somando os links de recuperação e os avisos de senha alterada. O limite pode ser configurado entre 1 e 90. A integração não contrata planos nem modifica cobrança. Chave, domínio verificado, rastreamento desativado e recebimento real precisam ser comprovados antes de liberar essa função à equipe.

A verificação de produção exige configuração Resend válida e `passwordResetAvailable: true` na API. O readiness não envia e-mail e não verifica o estado do domínio ou a entrega no provedor. A restauração invalida tokens de recuperação presentes no backup, além das sessões, e preserva os contadores armazenados.

O teste integrado usou o navegador, a API real em uma porta isolada, uma conta fictícia e um transporte de e-mail simulado: solicitação do link, remoção do token do endereço e ausência em armazenamento do navegador, formulário em 390 px sem transbordamento, confirmação da senha, rejeição da sessão anterior e da reutilização do link, login com a nova senha e persistência após reiniciar o servidor. Nenhum e-mail real foi enviado e a senha de Vicente permaneceu inalterada.

A conta Resend acessível no navegador mostrou dois domínios verificados: `vozdoestudante.com.br` e `prontojus.com.br`. Nenhum deles foi escolhido automaticamente como remetente do Nexo. A chave de envio ainda não está configurada neste projeto; por isso, a interface local informa que a recuperação por e-mail está indisponível. O subdomínio padrão `netlify.app` pode continuar sendo usado pelo site, mas não oferece o controle de DNS necessário para verificar um remetente próprio no Resend.

## Evidências locais

| Área                    | Evidência e limite                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backup consistente      | Teste com conexão SQLite ativa e transação não confirmada: o snapshot contém apenas a versão confirmada.                                            |
| Recuperação             | Teste de restauração em diretório temporário novo, conferindo conteúdo, usuários, artigos, uploads e originais. Sessões anteriores são revogadas.   |
| Integridade             | Manifesto com SHA-256, conferência de todos os arquivos e `PRAGMA quick_check`; arquivos ausentes ou modificados impedem a restauração.             |
| Proteção dos dados      | Testes recusam restauração sobre dados existentes, caminhos indevidos e links simbólicos. A retenção preserva diretórios manuais.                   |
| Conteúdo institucional  | Simulação e aplicação em banco temporário preservam o processo seletivo, os contatos e o rascunho operacional; backup obrigatório antes da escrita. |
| Verificação de ambiente | `npm run check:readiness` distingue o ambiente local da configuração de produção e nunca declara liberação pública automaticamente.                 |

Os comandos `npm test`, `npm run build` e `npm run test:e2e` devem passar na revisão candidata à entrega. Os testes usam bancos e arquivos temporários; não substituem um ensaio na hospedagem de destino. A suíte específica de operação está em `tests/ops.test.cjs`.

## Pendências de operação pública

| Critério                        | Como comprovar no destino                                                                                                       | Estado nesta revisão                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Aplicação Node completa         | HTTPS responde ao site, `/blog/`, `/admin/` e `/api/health`, encaminhados ao Fastify.                                           | Não verificado em hospedagem pública. A configuração Netlify do repositório publica somente arquivos estáticos. |
| Volume persistente              | Criar rascunho de teste e enviar arquivo; reiniciar/substituir contêiner; confirmar ambos.                                      | Depende da hospedagem de destino.                                                                               |
| TLS, domínio e proxy            | Certificado válido, `CMS_ORIGIN` exata e apenas o proxy real em `CMS_TRUST_PROXY`.                                              | Depende do domínio e provedor escolhidos.                                                                       |
| Contas da equipe                | Acessos individuais criados, senhas exclusivas e acesso antigo revogado.                                                        | Precisa de responsáveis e integrantes reais.                                                                    |
| Recuperação de senha por e-mail | Domínio verificado, rastreamento desligado, chave de envio restrita e teste autorizado com mensagem recebida e troca concluída. | Configuração e entrega real do Resend ainda dependem da conta e do domínio escolhidos.                          |
| Backup fora do servidor         | Conferir cópia em segundo armazenamento privado e permissão de acesso.                                                          | Não configurado externamente.                                                                                   |
| Restauração no destino          | Executar ensaio com backup real em diretório isolado e conferir conteúdo e arquivos.                                            | A restauração automatizada foi testada apenas em banco temporário.                                              |
| Monitoramento                   | Responsável recebe/acompanha falhas de disponibilidade, backup e armazenamento.                                                 | Precisa da rotina operacional do responsável.                                                                   |
| Revisão editorial               | Conferir contatos, processo seletivo, links, direitos de imagens e artigos.                                                     | Exige revisão da equipe antes da publicação institucional.                                                      |

Só liberar o acesso de produção após comprovar os critérios acima. O comando de readiness ajuda a repetir a conferência técnica; ele não verifica contratos, cobrança, revisão editorial, entrega de alertas ou durabilidade real do provedor.
