import { memo } from 'react';
import { X } from 'lucide-react';
import { SITE } from '../../config/site';
import { adsEnabled, ADS_DISCLOSURE } from '../../config/ads';
import { Modal } from '../ui/Modal';

/**
 * Política de Privacidade e Termos de Uso.
 *
 * Por que isto existe (não é burocracia à toa):
 *  - LGPD (Lei 13.709/2018) obriga informar quais dados você coleta e por quê.
 *    A loja coleta nome, WhatsApp e endereço no "Me Avise" e no checkout.
 *  - O AdSense NÃO aprova sites sem política de privacidade que mencione
 *    cookies de anúncio de terceiros.
 *  - Dá segurança jurídica para a Chelly e para o cliente.
 *
 * Ajuste os trechos marcados com [ ] antes de publicar.
 */

export type PolicyKind = 'privacy' | 'terms';

export const PolicyModal = memo(function PolicyModal({
  kind,
  onClose,
}: {
  kind: PolicyKind | null;
  onClose: () => void;
}) {
  if (!kind) return null;
  const isPrivacy = kind === 'privacy';
  const showAds = adsEnabled();

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="policy-title"
      maxWidth="max-w-2xl"
      className="text-left"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-pale pb-5">
        <h2 id="policy-title" className="text-2xl font-black text-slate italic">
          {isPrivacy ? 'Política de Privacidade' : 'Termos de Uso'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-slate-soft transition-colors hover:text-rose focus-visible:ring-2 focus-visible:ring-blue focus-visible:outline-none"
          aria-label="Fechar"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-5 pt-5 text-sm leading-relaxed text-slate-mid">
        <p className="text-xs text-slate-soft">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

        {isPrivacy ? (
          <>
            <Section title="1. Quem somos">
              A {SITE.name} é uma loja de cosméticos e perfumaria que atende {SITE.address.city} —{' '}
              {SITE.address.state}. Esta política explica quais dados coletamos, por que coletamos e
              como você pode pedir a exclusão deles.
            </Section>

            <Section title="2. Dados que coletamos">
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>Nome e WhatsApp</strong> — quando você pede para ser avisada sobre um
                  produto esgotado ou finaliza um pedido.
                </li>
                <li>
                  <strong>Endereço de entrega</strong> — rua, número, bairro e ponto de referência,
                  apenas para entregar o pedido.
                </li>
                <li>
                  <strong>Avaliações de produto</strong> — o nome e o texto que você publica
                  voluntariamente ficam visíveis para outras clientes.
                </li>
                <li>
                  <strong>Dados no seu aparelho</strong> — favoritos, sacola e último endereço ficam
                  guardados apenas no seu navegador/app (localStorage). Não são enviados para nós.
                </li>
              </ul>
              <p className="mt-2">
                <strong>Não coletamos</strong> número de cartão, senha de banco nem documento. O
                pagamento é feito por Pix, direto no aplicativo do seu banco.
              </p>
            </Section>

            <Section title="3. Por que usamos esses dados">
              Para responder sua solicitação, entregar o pedido, avisar quando o produto voltar ao
              estoque e melhorar a loja. Não vendemos nem alugamos seus dados para ninguém.
            </Section>

            {showAds && (
              <Section title="4. Anúncios e cookies de terceiros">
                {ADS_DISCLOSURE} O Google pode usar cookies (incluindo cookies de terceiros) para
                exibir anúncios com base em visitas anteriores. Você pode desativar isso em{' '}
                <a
                  href="https://www.google.com/settings/ads"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-blue underline"
                >
                  Configurações de Anúncios do Google
                </a>{' '}
                ou em{' '}
                <a
                  href="https://www.aboutads.info/choices/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-blue underline"
                >
                  aboutads.info/choices
                </a>
                .
              </Section>
            )}

            <Section title={showAds ? '5. Seus direitos (LGPD)' : '4. Seus direitos (LGPD)'}>
              Pela Lei Geral de Proteção de Dados você pode, a qualquer momento e sem custo:
              confirmar que tratamos seus dados, pedir correção, pedir exclusão, revogar o
              consentimento e reclamar à ANPD. Basta chamar no WhatsApp da loja que resolvemos.
            </Section>

            <Section title={showAds ? '6. Segurança' : '5. Segurança'}>
              Os dados trafegam por conexão criptografada (HTTPS) e ficam armazenados no Google
              Firebase/Firestore, com regras de acesso restritas. Senhas e dados de pagamento nunca
              passam por este site.
            </Section>

            <Section title={showAds ? '7. Contato' : '6. Contato'}>
              Dúvidas sobre privacidade: WhatsApp da {SITE.name}
              {SITE.social.instagram ? ` ou Instagram ${SITE.social.instagram}` : ''}.
            </Section>
          </>
        ) : (
          <>
            <Section title="1. Sobre a loja">
              A {SITE.name} vende cosméticos, perfumes e produtos de beleza com entrega em{' '}
              {SITE.address.city} — {SITE.address.state}. Este site é um catálogo: o pedido é
              confirmado por WhatsApp e o pagamento é feito por Pix.
            </Section>

            <Section title="2. Preços e estoque">
              Preços e disponibilidade são atualizados em tempo real, mas a confirmação final do
              pedido acontece na conversa pelo WhatsApp. Em caso de divergência, vale o combinado na
              conversa — e você sempre pode desistir antes de pagar.
            </Section>

            <Section title="3. Pagamento">
              Aceitamos Pix. O QR Code exibido é gerado no seu aparelho a partir da chave da loja;
              nenhum dado de pagamento passa por este site. Envie o comprovante pelo WhatsApp para
              agilizar a separação do pedido.
            </Section>

            <Section title="4. Entrega">
              Entregamos exclusivamente em {SITE.address.city}. Prazo e valor do frete são combinados
              pelo WhatsApp conforme o bairro. Confira o endereço antes de finalizar: não conseguimos
              redirecionar um pedido já despachado.
            </Section>

            <Section title="5. Trocas e arrependimento">
              Pelo Código de Defesa do Consumidor (art. 49) você tem 7 dias corridos, contados do
              recebimento, para se arrepender da compra feita fora do estabelecimento. Produtos de
              higiene pessoal e cosméticos com lacre violado só podem ser trocados em caso de defeito
              ou violação, por questão sanitária. Chame no WhatsApp que resolvemos.
            </Section>

            <Section title="6. Avaliações de clientes">
              Ao publicar uma avaliação você nos autoriza a exibi-la na loja. Não são permitidos
              conteúdo ofensivo, spam, dados de terceiros nem links. Podemos remover avaliações que
              violem isso.
            </Section>

            <Section title="7. Uso do site">
              O site é fornecido como está. Não é permitido usar robôs para copiar o catálogo,
              tentar burlar o painel administrativo nem sobrecarregar o serviço.
            </Section>

            <Section title="8. Foro">
              Fica eleito o foro da comarca de {SITE.address.city} — {SITE.address.state} para
              resolver qualquer questão destes termos.
            </Section>
          </>
        )}
      </div>
    </Modal>
  );
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-black tracking-wider text-slate uppercase not-italic">
        {title}
      </h3>
      <div className="text-slate-mid">{children}</div>
    </section>
  );
}
