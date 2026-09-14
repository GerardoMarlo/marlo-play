export const sections = [
 {id:'games',title:'GAMES',open:true,empty:'More games coming soon.',entries:[
  {slug:'pigeongod',title:'The Games of the Pigeon God',description:'Tactical arena board game against AI or local players.',status:'available',tag:'TACTICAL · 1–4 PLAYERS'}
 ]},
 {id:'not-games',title:'NOT GAMES',open:false,empty:'Nothing here yet.',entries:[]}
];
// This mapping is used only by the gateway, never serialized into portal HTML.
export const origins = {pigeongod:'https://pigeongod-origin.marlo.games'};
