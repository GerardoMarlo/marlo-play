import { useEffect, useRef, useState, type RefObject } from "react";
import { api } from "./api";

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string) {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => {
          scripts.delete(src);
          script.remove();
          reject(
            new Error(
              "No pudimos cargar el formulario seguro. Recarga la página.",
            ),
          );
        };
        document.head.appendChild(script);
      }),
    );
  }
  return scripts.get(src)!;
}

export function InlinePayment({
  amount,
  email,
  publicKey,
  controllerRef,
  onReady,
}: {
  amount: number;
  email: string;
  publicKey: string;
  controllerRef: RefObject<any>;
  onReady: (ready: boolean) => void;
}) {
  const [error, setError] = useState("");
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let controller: any;
    const target = document.createElement("div");
    target.id = "card-" + crypto.randomUUID();
    host.current!.appendChild(target);
    onReady(false);
    setError("");
    loadScript("https://sdk.mercadopago.com/js/v2")
      .then(async () => {
        if (disposed) return;
        const mp = new (window as any).MercadoPago(publicKey, {
          locale: "es-MX",
        });
        controller = await mp.bricks().create("cardPayment", target.id, {
          initialization: { amount, ...(email ? { payer: { email } } : {}) },
          customization: {
            visual: { hideFormTitle: true, hidePaymentButton: true },
          },
          callbacks: {
            onReady: () => {},
            onError: () => {
              if (!disposed)
                setError("Revisa los datos del formulario seguro.");
            },
            onSubmit: () => Promise.resolve(),
          },
        });
        if (disposed) {
          controller.unmount();
          return;
        }
        controllerRef.current = controller;
        onReady(true);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      controllerRef.current = null;
      onReady(false);
      controller?.unmount();
      target.remove();
    };
  }, [amount, email, publicKey, controllerRef, onReady]);
  return (
    <div className="inline-payment">
      <div className="payment-reassurance">
      <div className="payment-security">
        <div className="payment-security-heading">
          <span className="payment-provider-logo">
            <img src="/images/payments/mercadopago.svg" alt="Mercado Pago" width="40" height="40" />
            <span aria-hidden="true">Mercado Pago</span>
          </span>
          <strong>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 018 0v3" />
            </svg>
            Pago seguro
          </strong>
        </div>
        <p>Tus datos de pago se procesan de forma segura mediante Mercado Pago. Marlo Games no almacena los datos de tu tarjeta.</p>
      </div>
      <div className="card-brands" aria-label="Tarjetas aceptadas">
        <span><img src="/images/payments/visa.gif" alt="Visa" /></span>
        <span><img src="/images/payments/mastercard.svg" alt="Mastercard" /></span>
        <span><img src="/images/payments/amex.gif" alt="American Express" /></span>
      </div>
      </div>
      <div ref={host} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

export function InlinePayPal({
  clientId,
  createOrder,
  prepared,
}: {
  prepared?: boolean;
  clientId: string;
  createOrder: () => Promise<any>;
}) {
  const latest = useRef(createOrder);
  latest.current = createOrder;
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let controller: any;
    let order: any;
    loadScript(
      `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=MXN&intent=capture`,
    )
      .then(async () => {
        if (disposed) return;
        controller = (window as any).paypal.Buttons({
          createOrder: async () => {
            order = await latest.current();
            const payment = await api(
              "/orders/" + order.id + "/payment",
              {},
              undefined,
            );
            return payment.providerId;
          },
          onApprove: async () => {
            await api("/orders/" + order.id + "/capture", {}, undefined);
            window.location.href = "/pedido/confirmacion";
          },
          onCancel: () =>
            setError(
              "Autorización cancelada. Puedes volver a intentarlo aquí.",
            ),
          onError: () =>
            setError(
              "No se completó el pago. Revisa tus datos e intenta nuevamente.",
            ),
        });
        await controller.render("#inline-paypal");
        if (disposed) controller.close();
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      controller?.close?.();
    };
  }, [clientId]);
  return (
    <div className="inline-payment">
      <p>
        Completa tus datos y acepta los términos antes de autorizar la compra
        con PayPal.
      </p>
      {prepared && (
        <p role="status">
          Tu pedido está listo. Usa el botón de PayPal para autorizar y
          finalizar el pago.
        </p>
      )}
      <div id="inline-paypal" />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
