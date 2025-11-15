const navConfig = [
  { id: "home", label: "Home", href: "/" },
  { id: "animals", label: "Species", href: "/animals" },
  { id: "about", label: "About", href: "/about" },
  { id: "contact", label: "Contact", href: "/contact" },
];

const baseViewModel = {
  title: "REDLIST.COM - Threatened Wildlife Vietnam",
  favicon: "/assets/images/logo.png",
  stylesheets: [
    {
      href: "https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css",
      integrity:
        "sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB",
      crossorigin: "anonymous",
    },
    {
      href: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css",
    },
  ],
  scripts: [],
  brand: "REDLIST.COM",
  searchPlaceholder: "Search by common name, scientific name, region...",
  filterLabel: "Filters",
  newsTitle: "News",
  scaleMax: "250",
  scaleLabel: "Individual count",
  scaleMin: "0",
  paginationLabel: "Search results pagination",
  chatTitle: "Chat with the RAG assistant",
  chatPlaceholder: "Ask about threatened species in Vietnam...",
  chatSendLabel: "Send",
  footerNote: "&copy; 2025 REDLIST VN - Education & Outreach",
};

export function buildViewModel(options = {}) {
  const { activeNav = "home", ...rest } = options;

  const navLinks = navConfig.map((link) => ({
    label: link.label,
    href: link.href,
    active: link.id === activeNav,
  }));

  return {
    ...baseViewModel,
    ...rest,
    navLinks,
  };
}

export function getHomeViewModel() {
  return buildViewModel({ activeNav: "home" });
}

export function getAboutViewModel() {
  return buildViewModel({
    activeNav: "about",
    title: "About the REDLIST Team",
    scripts: [],
    pageHeading: "Meet the REDLIST project team",
    pageIntro:
      "We are four students researching endangered wildlife. Replace these placeholders with your team's real story, photos, and links.",
    teamMembers: [
      {
        name: "Nguyễn Ngọc Gia Nguyễn",
        role: "Research & data",
        email: "nguyengnocgianguyen@gmail.com",
        bio: "Add a short description about this person, their responsibilities, and their focus within the project.",
        image: "/assets/images/team/member1.jpg",
        socials: [
          { label: "LinkedIn", icon: "bi-linkedin", href: "#" },
          { label: "GitHub", icon: "bi-github", href: "#" },
        ],
      },
      {
        name: "Tô Phát Đạt",
        role: "Field operations",
        email: "tophatdat@example.com",
        bio: "Describe how this member contributes to the project, including their research interests or technical skills.",
        image: "/assets/images/team/member2.jpg",
        socials: [
          { label: "LinkedIn", icon: "bi-linkedin", href: "#" },
          { label: "Instagram", icon: "bi-instagram", href: "#" },
        ],
      },
      {
        name: "Võ Hữu Lộc",
        role: "Data engineering",
        email: "vohuuloc@example.com",
        bio: "Share their responsibilities, tools they use, or the part of the system they maintain.",
        image: "/assets/images/team/member3.jpg",
        socials: [
          { label: "LinkedIn", icon: "bi-linkedin", href: "#" },
          { label: "Website", icon: "bi-globe", href: "#" },
        ],
      },
      {
        name: "Trương Đình Khoa",
        role: "Design & outreach",
        email: "truongdinhkhoa3751@gmail.com",
        bio: "Explain how this teammate supports communications, UI, or community engagement for REDLIST.",
        image: "/assets/images/team/member4.jpg",
        socials: [
          { label: "LinkedIn", icon: "bi-linkedin", href: "#" },
          { label: "Dribbble", icon: "bi-dribbble", href: "#" },
        ],
      },
    ],
  });
}

export function getContactViewModel() {
  return buildViewModel({
    activeNav: "contact",
    title: "Contact REDLIST Vietnam",
    scripts: [],
    pageHeading: "Contact the REDLIST team",
    pageIntro:
      "We would love to hear from partners, journalists, and fellow conservationists. Use the details below or drop us a message.",
    contactChannels: [
      {
        type: "Email",
        value: "truongdinhkhoa3751@gmail.com",
        href: "mailto:truongdinhkhoa3751@gmail.com",
      },
      {
        type: "Phone",
        value: "(+84)337 642 568",
        href: "tel:(+84)337 642 568",
      },
      {
        type: "Address",
        value:
          "Univerisity of Education and Technology Ho Chi Minh City, Vietnam",
      },
    ],
    contactLead: {
      name: "Truong Dinh Khoa",
      role: "Project Contact",
      email: "truongdinhkhoa3751@gmail.com",
      phone: "(+84)337 642 568",
      avatar: "",
      socials: [
        {
          label: "LinkedIn",
          icon: "bi-linkedin",
          href: "https://www.linkedin.com/in/dinh-khoa-truong-78132b386/",
        },
        {
          label: "Facebook",
          icon: "bi-facebook",
          href: "https://www.facebook.com/khoa.0510/",
        },
        {
          label: "GitHub",
          icon: "bi-github",
          href: "https://github.com/dnhkhoa",
        },
      ],
    },
    contactForm: {
      heading: "Send a message",
      nameLabel: "Name",
      namePlaceholder: "Your full name",
      emailLabel: "Email",
      emailPlaceholder: "you@example.com",
      messageLabel: "Message",
      messagePlaceholder: "How can we collaborate?",
      submitLabel: "Send message",
    },
  });
}
