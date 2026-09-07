const item = (id, title, fields = {}) => ({
  id,
  title,
  description: "",
  detail: "",
  image: "",
  alt: "",
  url: "",
  ...fields,
});
const section = (id, label, title, description = "", fields = {}) => ({
  id,
  label,
  eyebrow: "",
  title,
  description,
  visible: true,
  items: [],
  extra: {},
  ...fields,
});

const DEFAULT_CONTENT = {
  site: {
    name: "Nexo Governamental XI de Agosto",
    description:
      "Somos uma extensão da Faculdade de Direito do Largo de São Francisco criada com intenção de fomentar a participação política e o debate ativo com os Três poderes e a sociedade civil.",
    email: "nexogov.usp@gmail.com",
    instagramUrl: "https://www.instagram.com/nexogovernamental/",
    instagramHandle: "@nexogovernamental",
    footerTitle: "⚖️ Nexo Governamental XI de Agosto",
  },
  sections: [
    section(
      "introduction",
      "Apresentação",
      "Nexo Governamental XI de Agosto",
      "Somos uma extensão da Faculdade de Direito do Largo de São Francisco criada com intenção de fomentar a participação política e o debate ativo com os Três poderes e a sociedade civil.",
      {
        extra: {
          image: "/assets/introduction/usp.webp",
          imageAlt:
            "Fachada da Faculdade de Direito da USP no Largo de São Francisco",
        },
      },
    ),
    section(
      "about",
      "Quem Somos",
      "Quem somos",
      "O Nexo Governamental é uma organização estudantil da Faculdade de Direito da USP que conecta acadêmicos e profissionais ao setor público. Eles promovem a discussão e criação de políticas públicas, oferecendo projetos, eventos e pesquisas que visam impactar positivamente a sociedade e a governança pública.",
      {
        items: [
          item("powers", "✅ Diálogo com os Três Poderes"),
          item("society", "✅ Diálogo com a sociedade civil"),
          item(
            "participation",
            "✅ Participação ativa em pautas políticas e sociais",
          ),
          item("information", "✅ Democratização da informação"),
        ],
        extra: {
          listTitle: "🔍 O que você encontra no Nexo:",
          videoTitle: "Fala Presidente",
          videoDescription:
            "Assista ao vídeo da presidente do Nexo Governamental explicando a missão e os projetos da organização.",
        },
      },
    ),
    section(
      "objective",
      "Nosso Objetivo",
      "Nosso\nObjetivo.",
      "O nosso objetivo é aproximar a comunidade civil da atuação dos três poderes da República Federativa do Brasil,",
      {
        extra: {
          detail:
            "por meio de uma série de projetos inovadores, com os quais buscamos promover o envolvimento dos cidadãos no processo de governança e na construção de uma sociedade mais participativa e inclusiva.",
          invitation:
            "Junte-se a nós e faça parte desse movimento que conecta a sociedade com as esferas do poder em nosso país.",
          civilLabel: "Comunidade civil",
          executiveLabel: "Executivo",
          legislativeLabel: "Legislativo",
          judiciaryLabel: "Judiciário",
          republicLabel: "República Federativa do Brasil",
        },
      },
    ),
    section(
      "recognize",
      "Reconhecimento",
      "reconhecido e respeitado.",
      "Com um compromisso sólido com a inovação, o Nexo Governamental aproxima acadêmicos e profissionais do setor público.",
      {
        eyebrow: "O Nexo Governamental é",
        items: [
          item("president", "Presidente da República", {
            image: "/assets/politicians/presidente.avif",
            alt: "Registro de encontro com o Presidente da República",
          }),
          item("vice", "Vice-presidente e Ministro", {
            image: "/assets/politicians/vice-presidente-ministro.avif",
            alt: "Registro de encontro com o Vice-presidente e Ministro",
          }),
          item("senate", "Presidente do Senado", {
            image: "/assets/politicians/presidente-do-senado.avif",
            alt: "Registro de encontro com o Presidente do Senado",
          }),
          item("labor", "Ministro do Trabalho", {
            image: "/assets/politicians/ministro-do-trabalho.avif",
            alt: "Registro de encontro com o Ministro do Trabalho",
          }),
          item("deputies", "Deputados", {
            image: "/assets/politicians/deputados.avif",
            alt: "Registro de encontro com deputados",
          }),
        ],
        extra: {
          galleryTitle: "Registros de encontros",
          communityTitle: "O Nexo em números.",
          membersValue: "300",
          membersLabel: "membros",
          universitiesValue: "80",
          universitiesLabel: "universidades",
        },
      },
    ),
    section("selective-process", "Processo seletivo", "Processo seletivo"),
    section(
      "more",
      "Veja Mais",
      "Veja mais sobre o Nexo Governamental",
      "Projetos, encontros e viagens que aproximam o conhecimento da vida pública.",
      {
        eyebrow: "O Nexo na prática",
        items: [
          item("school", "Nexo nas Escolas", {
            description:
              "Debates em escolas, com foco na capacitação dos alunos.",
            detail:
              "O projeto envolve estudantes de ETECs da Mooca, com etapas presenciais entre agosto e setembro de 2024 e final no Salão Nobre da FDUSP.",
            image: "/assets/more/school.webp",
            alt: "Sala de aula ilustrativa, sem pessoas, com carteiras em semicírculo e luz natural",
          }),
          item("events", "Eventos", {
            description:
              "Especialistas e autoridades em diálogo sobre temas atuais.",
            detail:
              "O Nexo promove encontros sobre tecnologia e direito, com debates sobre o impacto de inovações, como a inteligência artificial, na sociedade.",
            image: "/assets/more/events.webp",
            alt: "Auditório ilustrativo, sem pessoas, com mesa de debate, microfones e cadeiras azuis",
          }),
          item("travel", "Viagens", {
            description:
              "Uma imersão no ambiente político e jurídico do Brasil.",
            detail:
              "Em viagens como a de Brasília, os participantes visitam instituições como o Congresso e o STF, ampliando o aprendizado prático sobre temas importantes.",
            image: "/assets/more/travel.webp",
            alt: "Imagem ilustrativa do Palácio do Planalto em Brasília ao fim da tarde",
          }),
        ],
        extra: {
          schoolCategory: "Educação",
          eventsCategory: "Diálogo",
          travelCategory: "Vivência",
        },
      },
    ),
    section(
      "instagram",
      "Instagram",
      "O Nexo,\nmais perto.",
      "Projetos, encontros e novas ideias. Siga o Nexo Governamental no Instagram e acompanhe as novidades.",
      {
        eyebrow: "Nosso ponto de encontro",
        extra: {
          profileTitle: "Nexo Governamental",
          profileSubtitle: "XI de Agosto",
          institution: "Faculdade de Direito · USP",
          profileCta: "Abrir perfil no Instagram",
        },
      },
    ),
    section(
      "contact",
      "Contato",
      "Vamos\nconversar.",
      "Tem uma dúvida sobre o Nexo? Compartilhe sua mensagem com a nossa equipe.",
      {
        eyebrow: "Fale com o Nexo",
        extra: {
          availability:
            "O retorno depende da disponibilidade da equipe. Devido à demanda, nem todas as mensagens poderão ser respondidas.",
          emailLabel: "E-mail da equipe",
          formTitle: "Sua mensagem",
          formDescription: "Todos os campos são obrigatórios.",
          formHelp:
            "Seu aplicativo de e-mail será aberto com a mensagem preenchida. Confirme o envio por lá.",
          submitLabel: "Continuar por e-mail",
        },
      },
    ),
  ],
  selection: {
    status: "closed",
    edition: "",
    title: "Venha participar do Nexo",
    description: "",
    opensAt: "",
    closesAt: "",
    noticeUrl:
      "https://docs.google.com/document/d/1bq4BziBdcmhQVTp_dTgfuEn6KwCJk6_Nc6uIWjywXgs/edit?usp=drivesdk",
    applicationUrl: "",
    buttonLabel: "Inscreva-se",
    scheduleTitle: "Confira o Cronograma de inscrição ⬇️",
    scheduleImage: "/assets/selective-process.avif",
    stages: [],
  },
};

const FIELD_LABELS = {
  image: "Imagem de apresentação",
  imageAlt: "Descrição da imagem de apresentação",
  listTitle: "Título da lista",
  videoTitle: "Título do vídeo",
  videoDescription: "Descrição do vídeo",
  detail: "Texto complementar",
  invitation: "Convite",
  civilLabel: "Comunidade civil",
  executiveLabel: "Poder Executivo",
  legislativeLabel: "Poder Legislativo",
  judiciaryLabel: "Poder Judiciário",
  republicLabel: "Legenda da República",
  galleryTitle: "Título da galeria",
  communityTitle: "Título dos indicadores",
  membersValue: "Número de membros",
  membersLabel: "Legenda de membros",
  universitiesValue: "Número de universidades",
  universitiesLabel: "Legenda de universidades",
  schoolCategory: "Categoria de Nexo nas Escolas",
  eventsCategory: "Categoria de Eventos",
  travelCategory: "Categoria de Viagens",
  profileTitle: "Nome no cartão do Instagram",
  profileSubtitle: "Subtítulo do perfil",
  institution: "Instituição",
  profileCta: "Texto do link do perfil",
  availability: "Aviso sobre o retorno",
  emailLabel: "Legenda do e-mail",
  formTitle: "Título do formulário",
  formDescription: "Orientação do formulário",
  formHelp: "Aviso de envio por e-mail",
  submitLabel: "Texto do botão de contato",
};

module.exports = { DEFAULT_CONTENT, FIELD_LABELS };
