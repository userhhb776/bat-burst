# Bat Burst

Crie uma plataforma SaaS completa de CRM e Automação Cadenciada de Comunicação para WhatsApp integrada com a Evolution API (hospedada no Render.com) e backend em PostgreSQL/Lovable Cloud. O sistema deve ter design moderno, profissional e escuro (estilo dark dashboard, responsivo para desktop e celular).

A plataforma é dividida nas seguintes áreas centrais:

1. CONEXÃO WHATSAPP (Evolution API)
- Tela para conectar instâncias do WhatsApp via QR Code ou código de pareamento, usando as credenciais configuradas em variáveis de ambiente (EVOLUTION_API_URL e EVOLUTION_API_KEY).
- Indicador visual em tempo real do status da instância (Conectado, Desconectado, Conectando).
- Opção de renomear e gerenciar múltiplas instâncias.
- Suporte a verificação de grupos onde a instância participa, com função para sincronizar contatos dos grupos autorizados para dentro do CRM.

2. GESTÃO DE CONTATOS E SEGMENTAÇÕES
- Gestão de contatos com campos: Nome, WhatsApp (com normalização automática para padrão internacional DDI+DDD+Número), Empresa/Origem, Tags e Data de Cadastro.
- Importação flexível: importação via arquivo CSV, inserção manual individual/em lote, e importação selecionada a partir dos contatos dos grupos sincronizados.
- Limpeza e edição: editor rápido de contatos, remoção de administradores ou números inválidos antes de qualquer ação.
- Organização em Listas/Segmentos personalizados para fácil seleção nas campanhas.

3. CENTRAL DE SCRIPTS E VARIAÇÕES ANTI-SPAM
- Construtor de mensagens com suporte a funil em etapas (Mensagem 1, Mensagem 2, etc.) com intervalo programado entre elas.
- Sistema de Variações de Mensagem (Spintax / Mensagens Alternativas): para cada etapa do funil, permitir cadastrar várias redações alternativas. Durante o disparo, o sistema distribui as variações de forma balanceada e embaralhada para que mensagens consecutivas nunca sejam idênticas.
- Suporte a marcadores dinâmicos como {nome}, {empresa}, etc.

4. MOTOR DE CAMPANHAS E DISPARO CADENCIADO
- Wizard em etapas para criação de campanhas (inspirado na clareza do Meta Ads):
  - Etapa 1: Nome da campanha e seleção da instância de WhatsApp conectada.
  - Etapa 2: Seleção do público (lista de contatos ou "PACK - TESTE" com números próprios para validação prévia).
  - Etapa 3: Seleção do bloco de scripts e mensagens com variações.
  - Etapa 4: Configuração de segurança e cadência:
    * Horário de envio (seleção AM / PM) e dias da semana permitidos.
    * Limite diário de contatos a abordar.
    * Intervalo aleatório de segurança entre contatos (ex: 3 a 7 minutos).
    * Intervalo entre mensagens do mesmo funil (ex: 15 a 30 segundos).
    * Opção "Começar agora" para antecipar disparos imediatos mantendo os intervalos mínimos.
- Fila resiliente no banco com status por mensagem (pendente, enviando, enviada, falhou, cancelada).
- Se uma mensagem falhar porque o contato não tem WhatsApp, o sistema cancela as próximas mensagens daquele contato automaticamente sem travar a campanha.

5. DASHBOARD E MÉTRICAS EM TEMPO REAL
- Indicador visual de "Termômetro de Risco" (Baixo, Moderado, Alto) baseado na velocidade de envio, variedade de textos e horário.
- Gráficos e números: total de contatos importados, mensagens entregues, falhas e taxa de resposta.
- Histórico completo e log de envios para auditoria.
- Botão manual de sincronização/atualização de dados.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://bat-burst.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1df55bfb-e03b-41ec-9cb9-ec7001549854).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
