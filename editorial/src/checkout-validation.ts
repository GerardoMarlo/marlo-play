import { addressSchema, phone } from "./domain";
const addressLabels: Record<string, string> = {
  recipient: "Nombre del destinatario",
  phone: "Teléfono del destinatario",
  email: "Correo del destinatario",
  street: "Calle",
  exterior: "Número exterior",
  colony: "Colonia",
  city: "Municipio / ciudad",
  state: "Estado",
  postalCode: "Código postal",
  references: "Referencias",
};
export function checkoutContactError(
  customerPhone: unknown,
  address?: unknown,
) {
  const customer = phone.safeParse(customerPhone);
  if (!customer.success)
    return {
      name: "phone",
      message:
        "Revisa “Celular” en Tus datos: escribe un número de 10 dígitos.",
    };
  if (address) {
    const checked = addressSchema.safeParse(address);
    if (!checked.success) {
      const issue = checked.error.issues[0],
        field = String(issue.path[0]);
      return {
        name: field === "colony" ? "colony" : "address-" + field,
        message: `Revisa “${addressLabels[field] || field}”: ${issue.message}`,
      };
    }
  }
}
