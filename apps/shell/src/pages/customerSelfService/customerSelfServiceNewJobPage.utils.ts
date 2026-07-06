export type CustomerSelfServiceStep = "plate" | "contact" | "quote" | "address" | "review" | "success";

export type CustomerSelfServiceFormState = {
  plate: string;
  hasWof: boolean;
  name: string;
  phone: string;
  email: string;
  quoteEmail: string;
  notes: string;
  address: string;
  requiresQuote: boolean;
};

export function getCustomerSelfServiceSteps({ hasWof }: { hasWof: boolean }) {
  if (hasWof) {
    return [
      { id: "plate", label: "Plate" },
      { id: "contact", label: "Contact" },
      { id: "address", label: "Address" },
      { id: "review", label: "Review" },
    ];
  }

  return [
    { id: "plate", label: "Plate" },
    { id: "contact", label: "Contact" },
    { id: "quote", label: "Quote" },
    { id: "review", label: "Review" },
  ];
}

export function buildSelfServiceJobPayload({
  form,
  matchedCustomerId,
  customerEdited,
}: {
  form: CustomerSelfServiceFormState;
  matchedCustomerId: string;
  customerEdited: boolean;
}) {
  const repairQuoteEmail = form.hasWof ? "" : form.quoteEmail;

  return {
    plate: form.plate,
    hasWof: form.hasWof,
    name: form.name,
    phone: form.phone,
    email: repairQuoteEmail || form.email,
    quoteEmail: repairQuoteEmail || undefined,
    requiresQuote: !form.hasWof && form.requiresQuote,
    existingCustomerId: matchedCustomerId && !customerEdited ? Number(matchedCustomerId) : undefined,
    customerEdited,
    notes: form.notes,
    address: form.address || undefined,
  };
}
