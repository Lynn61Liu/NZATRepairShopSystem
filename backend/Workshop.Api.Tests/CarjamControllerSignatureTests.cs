using System.Reflection;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Controllers;

namespace Workshop.Api.Tests;

public class CarjamControllerSignatureTests
{
    [Fact]
    public void Import_ShouldAcceptOnlyQueryPlate()
    {
        var method = typeof(CarjamController).GetMethod(nameof(CarjamController.Import));

        method.Should().NotBeNull();

        var parameters = method!.GetParameters();
        parameters.Should().ContainSingle(p => p.Name == "plate" && p.ParameterType == typeof(string));
        parameters.Any(p => p.GetCustomAttribute<FromBodyAttribute>() is not null).Should().BeFalse();

        var plateParameter = parameters.Single(p => p.Name == "plate");
        plateParameter.GetCustomAttribute<FromQueryAttribute>().Should().NotBeNull();
    }
}
