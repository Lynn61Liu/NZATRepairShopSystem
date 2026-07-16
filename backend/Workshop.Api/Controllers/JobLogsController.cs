using System.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Workshop.Api.Data;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/jobs/{jobId:long}/logs")]
public sealed class JobLogsController : ControllerBase
{
    private readonly AppDbContext _db;

    public JobLogsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> Get(long jobId, CancellationToken ct)
    {
        const string sql = """
            WITH events AS (
                SELECT j.created_at AS occurred_at, 'job'::text AS category,
                       'Job created'::text AS title,
                       NULLIF(j.notes, '')::text AS detail
                FROM jobs j
                WHERE j.id = @jobId

                UNION ALL

                SELECT j.updated_at, 'job',
                       'Job updated',
                       CONCAT('Status: ', COALESCE(NULLIF(j.status, ''), '—'))
                FROM jobs j
                WHERE j.id = @jobId AND j.updated_at > j.created_at + INTERVAL '1 second'

                UNION ALL

                SELECT i.created_at, 'invoice',
                       'Invoice created',
                       CONCAT_WS(' · ', NULLIF(i.external_invoice_number, ''), NULLIF(i.external_status, ''), NULLIF(i.reference, ''))
                FROM job_invoices i
                WHERE i.job_id = @jobId

                UNION ALL

                SELECT i.updated_at, 'invoice',
                       'Invoice updated',
                       CONCAT_WS(' · ', NULLIF(i.external_invoice_number, ''), NULLIF(i.external_status, ''), NULLIF(i.reference, ''))
                FROM job_invoices i
                WHERE i.job_id = @jobId AND i.updated_at > i.created_at + INTERVAL '1 second'

                UNION ALL

                SELECT p.created_at, 'payment',
                       'Payment recorded',
                       CONCAT_WS(' · ', NULLIF(p.method, ''), CONCAT('$', p.amount::text), NULLIF(p.reference, ''))
                FROM job_payments p
                WHERE p.job_id = @jobId

                UNION ALL

                SELECT CASE
                           WHEN NULLIF(s.confirmed_po_number, '') IS NOT NULL THEN s.updated_at
                           ELSE COALESCE(s.manually_marked_sent_at, s.first_request_sent_at, s.created_at)
                       END,
                       'po',
                       CASE
                           WHEN NULLIF(s.confirmed_po_number, '') IS NOT NULL
                               THEN 'PO number saved'
                           WHEN s.manually_marked_sent_at IS NOT NULL THEN 'PO request marked as sent'
                           WHEN s.first_request_sent_at IS NOT NULL THEN 'PO request sent'
                           ELSE 'PO tracking created'
                       END,
                       CONCAT_WS(' · ', NULLIF(s.status, ''), NULLIF(s.confirmed_po_number, ''),
                                 NULLIF(s.detected_po_number, ''), NULLIF(s.confirmation_note, ''))
                FROM job_po_state s
                WHERE s.job_id = @jobId

                UNION ALL

                SELECT COALESCE(
                           CASE WHEN g.internal_date_ms > 0 THEN TO_TIMESTAMP(g.internal_date_ms / 1000.0) END,
                           g.created_at
                       ),
                       'email',
                       CASE LOWER(g.direction)
                           WHEN 'sent' THEN 'Email sent'
                           WHEN 'reply' THEN 'Email reply received'
                           WHEN 'reminder' THEN 'PO reminder sent'
                           ELSE 'Email activity'
                       END,
                       CONCAT_WS(' · ', NULLIF(g.subject, ''), NULLIF(g.counterparty_email, ''))
                FROM gmail_message_logs g
                WHERE g.correlation_id = (
                    SELECT s.correlation_id
                    FROM job_po_state s
                    WHERE s.job_id = @jobId
                    LIMIT 1
                )

                UNION ALL

                SELECT w.created_at, 'worklog',
                       'Job Sheet entry added',
                       CONCAT_WS(' · ', NULLIF(st.name, ''), w.work_date::date::text,
                                 CONCAT(w.start_time, '–', w.end_time), NULLIF(w.admin_note, ''))
                FROM worklogs w
                LEFT JOIN staff st ON st.id = w.staff_id
                WHERE w.job_id = @jobId

                UNION ALL

                SELECT m.created_at, 'mechanical',
                       'Mechanical work added',
                       NULLIF(m.description, '')
                FROM job_mech_services m
                WHERE m.job_id = @jobId

                UNION ALL

                SELECT mw.updated_at, 'mechanical',
                       'Mechanical status updated',
                       NULLIF(mw.status, '')
                FROM job_mech_workflows mw
                WHERE mw.job_id = @jobId

                UNION ALL

                SELECT p.created_at, 'parts',
                       'Parts item added',
                       CONCAT_WS(' · ', NULLIF(p.description, ''), p.status::text)
                FROM job_parts_services p
                WHERE p.job_id = @jobId

                UNION ALL

                SELECT p.updated_at, 'paint',
                       'Paint status updated',
                       CONCAT('Status: ', p.status, ' · Stage: ', p.current_stage, ' · Panels: ', p.panels)
                FROM job_paint_services p
                WHERE p.job_id = @jobId

                UNION ALL

                SELECT w.occurred_at, 'wof',
                       'WOF result recorded',
                       CONCAT_WS(' · ', w.record_state::text, NULLIF(w.fail_reasons, ''), NULLIF(w.note, ''))
                FROM job_wof_records w
                WHERE w.job_id = @jobId
            )
            SELECT occurred_at, category, title, NULLIF(detail, '') AS detail
            FROM events
            WHERE occurred_at IS NOT NULL
            ORDER BY occurred_at DESC
            LIMIT 100;
            """;

        var connection = _db.Database.GetDbConnection();
        var shouldClose = connection.State != ConnectionState.Open;
        if (shouldClose)
            await connection.OpenAsync(ct);

        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = sql;
            command.Parameters.Add(new NpgsqlParameter<long>("jobId", jobId));

            var items = new List<JobLogItem>();
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                items.Add(new JobLogItem(
                    reader.GetFieldValue<DateTime>(0),
                    reader.GetString(1),
                    reader.GetString(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3)));
            }

            return Ok(new { items });
        }
        finally
        {
            if (shouldClose)
                await connection.CloseAsync();
        }
    }

    private sealed record JobLogItem(DateTime OccurredAt, string Category, string Title, string? Detail);
}
