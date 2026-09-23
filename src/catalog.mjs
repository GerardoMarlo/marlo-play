export const sections = [
  {
    id: 'games',
    title: 'GAMES',
    subtitle: 'The playable department',
    open: true,
    empty: 'More games are on the workbench.',
    entries: [
      {
        slug: 'pigeongod',
        title: 'The Games of the Pigeon God',
        description: 'Rats in an arena. A pigeon with unreasonable expectations. A tactical board game where every fight can turn on a single roll.',
        status: 'available',
        tag: 'TACTICAL BOARD GAME',
        details: 'Play in your browser · AI or local players',
        image: '/assets/pigeongod-cover-en.webp',
        imageAlt: 'The Games of the Pigeon God: a Rat champion raises a cheese trophy beneath the arena Cat',
        artLabel:'PLAYABLE PROTOTYPE',
        cta: 'Enter the arena'
      }
    ]
  },
  {
    id: 'not-games',
    title: 'NOT GAMES',
    subtitle: 'Other perfectly reasonable projects',
    open: false,
    empty: 'Nothing escaped the workbench. Yet.',
    emptyDetail: 'Tools, experiments, animations, words, and whatever the next idea turns into.',
    entries: [
      {
        slug: 'prepress',
        title: 'Pre-Press Tool',
        description: 'Prepare board game cards, hex tiles, and tokens for print. Arrange components, control sizing and copies, and export print-ready sheets.',
        status: 'available',
        tag: 'PRINT TOOL',
        details: 'Cards · Hexes · Tokens · Custom paper sizes',
        image: '/assets/prepress-tool.webp',
        imageAlt: 'Marlo Pre-Press Tool for preparing board game components for printing',
        artLabel:'Print tool',
        cta: 'Open the tool'
      }
    ]
  }
];

export const brand = {
  logo: '/assets/marlo-logo.webp'
};

// Private gateway mapping; never included in page HTML.
export const origins = {
  pigeongod: 'https://pigeongod-origin.marlo.games',
  prepress: 'https://prepress-origin.marlo.games'
};