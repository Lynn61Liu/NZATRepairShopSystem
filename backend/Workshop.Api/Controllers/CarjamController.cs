using Microsoft.AspNetCore.Mvc;
using Workshop.Api.DTOs;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/carjam")]
public class CarjamController : ControllerBase
{
    [HttpPost("import")]
    public IActionResult Import([FromBody] CarjamImportRequest req)
    {
        if (req == null || string.IsNullOrWhiteSpace(req.Plate))
            return BadRequest(new { success = false, error = "Plate is required." });

        return StatusCode(410, new
        {
            success = false,
            error = "Import is disabled on server. Run the local importer to fetch data."
        });
    }
}
