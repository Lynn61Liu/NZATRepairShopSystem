using System.Collections.ObjectModel;

namespace Workshop.Api.Printing;

public enum WofPrintField
{
    Rego,
    MakeModel,
    OdoText,
    RecordState,
    NewWofDate,
    RecheckedDate,
    FailRecheckDate,
    AuthCode,
    CheckSheet,
    CsNo,
    WofLabel,
    LabelNo,
    FailReasons,
    PreviousExpiryDate,
    OrganisationName,
    Note
}

public record FieldLayout(float Xmm, float Ymm, float WidthMm, string Align, float FontSizePt);

public static class WofPrintLayoutRegistry
{
    public static readonly IReadOnlyDictionary<WofPrintField, FieldLayout> Fields =
        new ReadOnlyDictionary<WofPrintField, FieldLayout>(new Dictionary<WofPrintField, FieldLayout>
        {
            [WofPrintField.Rego] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.MakeModel] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.OdoText] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.RecordState] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.NewWofDate] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.RecheckedDate] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.FailRecheckDate] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.AuthCode] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.CheckSheet] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.CsNo] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.WofLabel] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.LabelNo] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.FailReasons] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.PreviousExpiryDate] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.OrganisationName] = new FieldLayout(0, 0, 0, "Left", 10),
            [WofPrintField.Note] = new FieldLayout(0, 0, 0, "Left", 10)
        });
}
