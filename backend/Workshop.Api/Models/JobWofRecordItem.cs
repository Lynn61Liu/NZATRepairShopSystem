using NpgsqlTypes;

namespace Workshop.Api.Models;

public class JobWofRecordItem
{
    public long Id { get; set; }
    public long JobWofRecordId { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public string ItemType { get; set; } = WofRecordItemTypes.Status;
    public WofItemStatus Status { get; set; } = WofItemStatus.Pass;
    public long? FailReasonId { get; set; }
    public int SortOrder { get; set; }
    public decimal? NumericValue { get; set; }
    public string? InputValue { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public static class WofRecordItemTypes
{
    public const string Status = "status";
    public const string Number = "number";
}

public sealed record WofRecordItemDefinition(string Code, string Label, string ItemType, int SortOrder);

public static class WofRecordItemCatalog
{
    public static readonly IReadOnlyList<WofRecordItemDefinition> All =
    [
        Status("E1", "DIRECTION INDICATOR LAMPS (FRONT)", 1001),
        Status("E2", "FORWARD-FACING POSITION LAMPS", 1002),
        Status("E3", "HEADLAMPS", 1003),
        Status("E5", "FRONT AND REAR FOG LAMPS", 1005),
        Status("E6", "DIRECTION INDICATOR LAMPS (REAR)", 1006),
        Status("E7", "REARWARD FACING POSITION LAMPS", 1007),
        Status("E8", "STOP LAMPS", 1008),
        Status("E9", "HIGH-MOUNTED STOP LAMPS", 1009),
        Status("E10", "REGISTRATION PLATE LAMPS", 1010),
        Status("E11", "REAR REFLECTORS", 1011),
        Status("E12", "OTHER LAMPS", 1012),
        Status("E13", "WINDSCREEN", 1013),
        Status("E14", "OTHER GLAZING", 1014),
        Status("E15", "DOORS AND HINGED PANELS", 1015),
        Status("E16", "MUDGUARDS", 1016),
        Status("E17", "EXTERNAL PROJECTIONS", 1017),
        Status("E18", "FOOTRESTS (MOTORCYCLES ONLY)", 1018),
        Status("E19", "STRUCTURE/CORROSION (PANELS, DOOR PILLARS, ETC)", 1019),
        Status("E20", "DIMENSIONS", 1020),

        Status("I1", "WIPERS/OPERATION", 2001),
        Status("I2", "WASHERS/OPERATION", 2002),
        Status("I3", "REAR VIEW MIRRORS", 2003),
        Status("I4", "SUN VISORS", 2004),
        Status("I5", "SEATBELTS", 2005),
        Status("I6", "SEATBELT ANCHORAGES", 2006),
        Status("I7", "SEATS AND SEAT ANCHORAGES", 2007),
        Status("I8", "HEAD RESTRAINTS", 2008),
        Status("I9", "INTERIOR IMPACT", 2009),
        Status("I10", "AIRBAG SELF CHECK (DASHBOARD WARNING LAMP)", 2010),
        Status("I11", "ABS SELF CHECK (DASHBOARD WARNING LAMP)", 2011),
        Status("I12", "AUDIBLE WARNING DEVICE", 2012),
        Status("I13", "SPARE WHEEL SECURITY", 2013),

        Status("C1", "WHEELS, HUBS AND AXLES", 3001),
        Status("C2", "STEERING MECHANISM AND COMPONENTS", 3002),
        Status("C3", "SUSPENSION MECHANISM AND COMPONENTS", 3003),
        Status("C4", "FUEL TANK AND FUEL LINES", 3004),
        Status("C5", "BRAKE COMPONENTS (INCL CONTROLS, LINKAGES, LINES AND HOSES)", 3005),
        Status("C6", "EXHAUST SYSTEM AND VISIBLE SMOKE", 3006),
        Status("C7", "TYRE CONDITION", 3007),
        Status("C8", "TYRE TREAD AND DEPTH", 3008),
        Status("C9", "TOWING CONNECTIONS", 3009),
        Status("C10", "SAFETY CHAIN (TRAILERS <2000KG GVM)", 3010),
        Status("C11", "DUAL SAFETY CHAIN TRAILERS 2000KG-2500KG LADEN (NOT FITTED WITH BREAKAWAY BRAKE)", 3011),
        Status("C12", "STRUCTURE/CORROSION (CHASSIS/FLOOR PAN ETC)", 3012),

        Number("CFL", "SERVICE BRAKE FRONT LEFT READING", 4001),
        Number("CFR", "SERVICE BRAKE FRONT RIGHT READING", 4002),
        Number("CRL", "SERVICE BRAKE REAR LEFT READING", 4003),
        Number("CRR", "SERVICE BRAKE REAR RIGHT READING", 4004),
        Status("R1", "SERVICE BRAKE PERFORMANCE", 4011),
        Status("R2", "SERVICE BRAKE BALANCE", 4012),
        Status("PBL", "PARKING BRAKE LEFT", 4021),
        Status("PBR", "PARKING BRAKE RIGHT", 4022),
        Number("PBRL", "PARKING BRAKE LEFT READING", 4023),
        Number("PBRR", "PARKING BRAKE RIGHT READING", 4024),
        Status("R3", "PARKING BRAKE PERFORMANCE", 4031),
        Status("R4", "TRAILER BREAKAWAY BRAKE", 4032),
        Status("R5", "SPEEDOMETER", 4033),

        Status("U1", "A/F SYSTEM IN WORKING ORDER", 5001),
        Status("U2", "A/F CERTIFICATE CURRENT", 5002),
        Status("U3", "A/F SYSTEM SAFE", 5003),
        Status("U4", "MODIFIED VEHICLE (DECLARATION CERTIFICATE/LVV PLATE)", 5004),
        Status("U5", "CHASSIS/VIN NUMBER (PRESENT AND RECORDED CORRECTLY)", 5005),
        Status("U6", "STRUCTURE/CORROSION (FIREWALL/INNER GUARDS, ETC)", 5006),
        Status("U7", "ENGINE AND DRIVE TRAIN", 5007),
        Status("U8", "FUEL SYSTEM", 5008),
    ];

    private static WofRecordItemDefinition Status(string code, string label, int sortOrder)
        => new(code, label, WofRecordItemTypes.Status, sortOrder);

    private static WofRecordItemDefinition Number(string code, string label, int sortOrder)
        => new(code, label, WofRecordItemTypes.Number, sortOrder);
}

public enum WofItemStatus
{
    [PgName("pass")] Pass,
    [PgName("fail")] Fail,
    [PgName("na")] NA
}
