# Repair Quote Step Design

## Goal

When a customer creates a Repair job through `/customer/new-job`, the flow asks whether the job requires a quote. If selected, the created job receives the `报价` tag and the optional email is stored on the customer record.

## Flow

- WOF remains unchanged: `Plate -> Contact -> Address -> Review -> Success`.
- Repair changes to: `Plate -> Contact -> Quote -> Review -> Success`.
- The Quote step contains:
  - A checkbox labelled `是否报价`.
  - An optional email input.
- Review shows the quote choice for Repair jobs and shows the email when provided.

## Data Model

- The quote checkbox is submitted as `requiresQuote`.
- The quote email is submitted as `quoteEmail`.
- `quoteEmail` maps into the same customer email field used elsewhere, so it is stored in `customers.email`.
- When `requiresQuote` is true, the backend ensures a `tags` row named `报价` exists, then inserts the relationship into `job_tags`.

## Backend

`CustomerSelfServiceJobRequest` accepts `RequiresQuote` and `QuoteEmail`.

`CustomerSelfServiceJobMapper` maps the email into `NewJobRequest.Customer.Email` with this precedence:

1. `QuoteEmail`
2. existing `Email`

The controller writes the `报价` tag only after the job has been created successfully. This keeps the tag tied to a real job id and avoids changing the shared new job creation service for a self-service-only behavior.

## Tests

- Mapper test: Repair quote email becomes customer email.
- Controller/backend behavior test: a repair self-service request with `RequiresQuote=true` persists `报价` in `tags` and the job/tag relationship in `job_tags`.
- Frontend test or pure helper test: Repair step order includes `quote` between contact and review, and submit payload includes `requiresQuote` and `quoteEmail`.

## Out Of Scope

- Email validation beyond optional trimming.
- Creating a separate quote entity/table.
- Changing WOF flow or tag behavior.
