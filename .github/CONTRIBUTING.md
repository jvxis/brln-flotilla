# Contribuindo com o chat do BR⚡LN

Este repositório é o chat da comunidade BR⚡LN (chat.br-ln.com e o app BR⚡LN Community do LightningOS). Ele é uma cópia modificada do [Flotilla](https://gitea.coracle.social/coracle/flotilla), e as modificações estão explicadas uma a uma no [`PATCHES.md`](../PATCHES.md).

O `CONTRIBUTING.md` da raiz é o do Flotilla original. Vale para quem quer contribuir com **ele**, e não com esta cópia.

## Como contribuir

- **Achou um defeito?** Abra uma issue aqui. Diga o que fez, o que esperava e o que aconteceu. Se puder, mande o que o console do navegador mostrou (F12). Um print ajuda. Se o defeito for do Flotilla original ou da welshman, e não nosso, a gente leva a issue para lá.
- **Quer consertar ou melhorar algo?** Faça um fork, crie uma branch e abra um PR contra a `main`. Para uma mudança grande, abra uma issue antes, para combinarmos o caminho.
- **Achou uma falha de segurança?** Não abra issue pública. Veja o [`SECURITY.md`](SECURITY.md).

Todo PR precisa dizer **o que muda para quem usa o chat** e **como foi testado**. Quando é conserto de defeito, a regra da casa é reproduzir primeiro e consertar depois: descreva como o defeito aparecia e como você confirmou que sumiu.

Siga as convenções de código do [`AGENTS.md`](../AGENTS.md) e rode `pnpm run lint` e `pnpm run check` antes de abrir o PR. O CI roda os dois, e também o build com a configuração do clube.

## O que não aceitamos

- Chave, senha, token ou `.env` preenchido, em qualquer arquivo ou mensagem.
- Serviço de terceiros novo, como telemetria, analytics, CDN, relay ou servidor de mídia de fora do clube, sem uma issue discutida antes. O CI recusa o build que referencia os serviços da Coracle.
- Dependência nova sem justificativa no PR.

## Como os PRs de fora são revisados

Esta é a política dos mantenedores, publicada para quem contribui saber o que esperar.

1. **O CI de quem é de fora só roda depois que um mantenedor aprova.** Antes de aprovar, o mantenedor lê o que mudou em `.github/`, `deploy/`, `scripts/`, `package.json` e `pnpm-lock.yaml`.
2. **A revisão é linha a linha.** Recebem atenção redobrada:
   - as partes que lidam com chave, assinatura e sessão: `remoteSigner.ts`, `nip46.ts`, `session.ts`, `authRetry.ts`, `LogIn*`;
   - qualquer endereço novo (relay, servidor, URL);
   - a política de segurança de conteúdo (CSP);
   - o que o chat publica em nome do membro.
3. **Dependência nova ou atualizada** precisa ser conferida: quem publica, se a versão está fixada e o que mudou no lockfile.
4. **O código de um PR nunca roda numa máquina com chaves ou segredos.** Ele roda num ambiente descartável.
5. **O merge é feito por squash**, com a mensagem escrita pelo mantenedor, e a mudança entra no `PATCHES.md` quando altera o comportamento do Flotilla.
6. **Publicar é só com os mantenedores.** Tag `web-v…`, imagem e deploy no site ou no LightningOS vêm depois do merge, com o teste de sempre.

Nada disso é desconfiança de quem contribui: o chat guarda a identidade dos membros, e o cuidado vale igual para os PRs dos próprios mantenedores.
