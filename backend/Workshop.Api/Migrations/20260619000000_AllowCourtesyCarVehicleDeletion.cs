using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Workshop.Api.Migrations
{
    public partial class AllowCourtesyCarVehicleDeletion : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE courtesy_car_agreements
                  ALTER COLUMN vehicle_id DROP NOT NULL;

                ALTER TABLE courtesy_car_agreements
                  DROP CONSTRAINT IF EXISTS fk_courtesy_car_agreements_vehicle;

                ALTER TABLE courtesy_car_agreements
                  ADD CONSTRAINT fk_courtesy_car_agreements_vehicle FOREIGN KEY (vehicle_id) REFERENCES courtesy_cars(id) ON DELETE SET NULL;
            """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE courtesy_car_agreements
                  DROP CONSTRAINT IF EXISTS fk_courtesy_car_agreements_vehicle;

                ALTER TABLE courtesy_car_agreements
                  ALTER COLUMN vehicle_id SET NOT NULL;

                ALTER TABLE courtesy_car_agreements
                  ADD CONSTRAINT fk_courtesy_car_agreements_vehicle FOREIGN KEY (vehicle_id) REFERENCES courtesy_cars(id) ON DELETE RESTRICT;
            """);
        }
    }
}
