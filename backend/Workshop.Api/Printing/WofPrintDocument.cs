using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Workshop.Api.Printing;

public class WofPrintDocument : IDocument
{
    private readonly WofPrintModel _model;

    public WofPrintDocument(WofPrintModel model)
    {
        _model = model;
    }

    public DocumentMetadata GetMetadata() => DocumentMetadata.Default;

    public void Compose(IDocumentContainer container)
    {
        container.Page(page =>
        {
            page.Size(215.9f, 355.6f, Unit.Millimetre);
            page.Margin(12, Unit.Millimetre);
            page.DefaultTextStyle(TextStyle.Default.FontSize(10));

            page.Content().Column(column =>
            {
                column.Spacing(8);

                column.Item().Element(RenderHeader);
                column.Item().Element(RenderCommonModule);
                column.Item().Element(RenderWofCheckSheetModule);
                column.Item().Element(RenderInitialModule);

                if (_model.PrintState == WofPrintState.Recheck)
                    column.Item().Element(RenderRecheckModule);

                if (_model.PrintState == WofPrintState.Failed)
                    column.Item().Element(RenderFailedModule);
            });
        });
    }

    private void RenderHeader(IContainer container)
    {
        container.Row(row =>
        {
            row.RelativeItem().Text("WOF Print Preview").FontSize(16).SemiBold();
            row.ConstantItem(200).AlignRight().Text($"State: {_model.RecordStateLabel}");
        });
    }

    private void RenderCommonModule(IContainer container)
    {
        Section(container, "Common Fields", content =>
        {
            var items = new List<(string Label, string Value)>
            {
                ("Rego", _model.Rego),
                ("Make/Model", _model.MakeModel),
                ("Odo", _model.OdoText),
                ("Organisation", _model.OrganisationName),
                ("Customer", _model.CustomerName),
                ("Phone", _model.CustomerPhone),
                ("Email", _model.CustomerEmail),
                ("Address", _model.CustomerAddress)
            };

            RenderKeyValueTable(content, items);
        });
    }

    private void RenderWofCheckSheetModule(IContainer container)
    {
        Section(container, "WOF Checksheet", content =>
        {
            var items = new List<(string Label, string Value)>
            {
                ("Job #", _model.JobId.ToString()),
                ("MS #", _model.MsNumber),
                ("New WOF", _model.IsNewWof ? "Yes" : "No"),
                ("New WOF Date", _model.NewWofDate),
                ("System Auth #", _model.AuthCode),
                ("WOF Lab #", _model.WofLabel),
                ("Check Sheet", _model.CheckSheet),
                ("CS No", _model.CsNo),
                ("Label No", _model.LabelNo)
            };

            RenderKeyValueTable(content, items);
        });
    }

    private void RenderInitialModule(IContainer container)
    {
        Section(container, "Initial", content =>
        {
            var items = new List<(string Label, string Value)>
            {
                ("Inspection Date", _model.InspectionDate),
                ("Inspection #", _model.InspectionNumber),
                ("Record State", _model.RecordStateLabel),
                ("Previous Expiry Date", _model.PreviousExpiryDate)
            };

            RenderKeyValueTable(content, items);
        });
    }

    private void RenderRecheckModule(IContainer container)
    {
        Section(container, "Recheck", content =>
        {
            var items = new List<(string Label, string Value)>
            {
                ("Recheck Date", _model.RecheckDate),
                ("Odo", _model.OdoText),
                ("Recheck #", _model.RecheckNumber)
            };

            RenderKeyValueTable(content, items);
        });
    }

    private void RenderFailedModule(IContainer container)
    {
        Section(container, "Failed", content =>
        {
            content.Column(col =>
            {
                col.Spacing(4);
                col.Item().Text("Fail Reasons").SemiBold();
                col.Item().Text(string.IsNullOrWhiteSpace(_model.FailReasons) ? "(none)" : _model.FailReasons);
                col.Item().Text($"Fail/Recheck Date: {_model.FailRecheckDate}");
                col.Item().Text($"Note: {_model.Note}");
            });
        });
    }

    private static void Section(IContainer container, string title, Action<IContainer> content)
    {
        container.Border(1).BorderColor(Colors.Grey.Lighten2).Padding(6).Column(col =>
        {
            col.Item().Text(title).SemiBold();
            col.Item().LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
            col.Item().PaddingTop(4).Element(content);
        });
    }

    private static void RenderKeyValueTable(IContainer container, IReadOnlyList<(string Label, string Value)> items)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.ConstantColumn(120);
                columns.RelativeColumn();
            });

            foreach (var (label, value) in items)
            {
                table.Cell().Element(CellStyle).Text(label);
                table.Cell().Element(CellStyle).Text(value ?? "");
            }
        });
    }

    private static IContainer CellStyle(IContainer container)
    {
        return container.BorderBottom(1).BorderColor(Colors.Grey.Lighten3).PaddingVertical(2);
    }
}
