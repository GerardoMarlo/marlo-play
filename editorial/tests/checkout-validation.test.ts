import { it, expect } from "vitest";
import { checkoutContactError } from "../src/checkout-validation";
const address = {
  recipient: "Prueba",
  phone: "3312345678",
  email: "test@example.com",
  street: "Prueba",
  exterior: "1",
  colony: "Centro",
  city: "Zapopan",
  state: "Jalisco",
  postalCode: "45066",
  country: "MX",
};
it("accepts ten digits, separators and the Mexican country code", () => {
  for (const phone of ["3312345678", "33 1234 5678", "+52 (33) 1234-5678"])
    expect(checkoutContactError(phone, { ...address, phone })).toBeUndefined();
});
it("identifies recipient phone independently of a valid customer phone", () => {
  expect(
    checkoutContactError("3312345678", { ...address, phone: "test" }),
  ).toEqual({
    name: "address-phone",
    message:
      "Revisa “Teléfono del destinatario”: Escribe un teléfono mexicano de 10 dígitos.",
  });
  expect(checkoutContactError("test", address)?.name).toBe("phone");
});
