// Configuração do app. As ideias moram no repositório privado abaixo; o app só lê e grava pela API do GitHub.
export default {
  owner: 'leonardohfmarques-ship-it',
  repo: 'brainstorm',
  branch: 'main',
  // "Entrar com GitHub": endereço do Worker (pasta worker/), ex. 'https://brainstorm-entrar.<conta>.workers.dev'.
  // Vazio = o botão não aparece e o app pede a chave colada, como antes.
  login: { worker: '' },
  // atalhos para a produção (fora do BRAINSTORM): o app copia o caminho
  atalhos: [
    { nome: 'Roteiros de Reels', onde: '~/Desktop/instagram/roteiros' },
    { nome: 'Calendário de Reels', onde: '~/Desktop/Calendário de Reels' },
    { nome: 'Roteiros do YouTube', onde: '~/Desktop/youtube' },
    { nome: 'Calendário do YouTube', onde: '~/Desktop/Calendário do YouTube' },
    { nome: 'Produção do Instagram', onde: '~/Desktop/Produção do Instagram' }
  ]
};
