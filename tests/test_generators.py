import unittest

from src.cabinet_generator import BuildVolume, CabinetGenerator, CabinetSpec
from src.drawer_generator import DrawerGenerator


class CabinetGeneratorTests(unittest.TestCase):
    def test_contract_contains_grid_and_panel_partitioning(self) -> None:
        spec = CabinetSpec(width=126.0, depth=88.0, height=72.0, build_volume=BuildVolume(x=60.0, y=220.0, z=250.0))
        contract = CabinetGenerator(spec).export_contract()

        self.assertEqual(contract["generator"], "cabinet")
        self.assertEqual(contract["grid"]["columns"], 2)
        self.assertEqual(contract["grid"]["rows"], 2)
        self.assertGreater(len(contract["flat_pack_panels"][0]["segments"]), 1)
        self.assertEqual(len(contract["drawers"]["entries"]), 4)

    def test_invalid_dimension_rejected_when_not_aligned_to_extrusion_unit(self) -> None:
        with self.assertRaises(ValueError):
            CabinetGenerator(CabinetSpec(width=125.9, depth=88.0, height=72.0))


class DrawerGeneratorTests(unittest.TestCase):
    def test_drawer_consumes_cabinet_contract_with_clearance(self) -> None:
        contract = CabinetGenerator(CabinetSpec(width=126.0, depth=88.0, height=72.0)).export_contract()

        drawer = DrawerGenerator.from_cabinet_contract(contract, row=0, column=0, wall_profile="45-degree-trusses")
        plan = drawer.generate_plan()

        entry = contract["drawers"]["entries"][0]
        self.assertLess(plan["outer_dimensions"]["width"], entry["width"])
        self.assertLess(plan["outer_dimensions"]["depth"], entry["depth"])
        self.assertTrue(plan["handle"]["support_free"])
        self.assertEqual(plan["wall_profile"], "45-degree-trusses")

    def test_missing_slot_raises_clear_error(self) -> None:
        contract = CabinetGenerator(CabinetSpec(width=126.0, depth=88.0, height=72.0)).export_contract()

        with self.assertRaises(ValueError):
            DrawerGenerator.from_cabinet_contract(contract, row=99, column=99)


if __name__ == "__main__":
    unittest.main()
