"""Regenerate small, synthetic PDFs for the local text reader integration tests.

Test-only dependencies: reportlab, pypdf and Pillow. They are not app/runtime
dependencies. The fixtures are committed, so normal JS tests do not need them.
"""
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, NumberObject
from reportlab.lib.pagesizes import A4
from reportlab.lib.pdfencrypt import StandardEncryption
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

ROOT = Path(__file__).parent


def page(c, group, rows):
    c.setFont("Helvetica-Bold", 15)
    c.drawString(48, 796, group)
    c.setFont("Helvetica-Bold", 11)
    for x, value in [(48, "CH"), (115, "NOME"), (330, "MIC / DI")]:
        c.drawString(x, 764, value)
    c.setFont("Helvetica", 11)
    for index, (channel, name, microphone) in enumerate(rows):
        y = 738 - index * 26
        for x, value in [(48, str(channel)), (115, name), (330, microphone)]:
            c.drawString(x, y, value)
    c.showPage()


c = canvas.Canvas(str(ROOT / "channel-list.pdf"), pagesize=A4, invariant=1)
page(c, "BATTERIA", [(1, "Kick In", "D6"), (2, "Snare Top", "SM57"), (3, "Overhead L", "C451"), (4, "Overhead R", "C451")])
page(c, "BAND", [(5, "Bass DI", "DI"), (6, "Guitar", "SM57"), (7, "Keys L", "DI"), (8, "Keys R", "DI"), (9, "Lead Vocal", "B58")])
c.save()

geometry = BytesIO()
c = canvas.Canvas(geometry, pagesize=(600, 800), invariant=1)
c.setFont("Helvetica", 12)
c.drawString(72, 720, "ROTATED TEXT")
c.showPage()
c.setFont("Helvetica", 12)
c.drawString(100, 600, "CROPPED TEXT")
c.showPage()
c.save()
reader = PdfReader(geometry)
writer = PdfWriter()
rotated = writer.add_page(reader.pages[0])
rotated.rotate(90)
cropped = writer.add_page(reader.pages[1])
cropped.cropbox.lower_left = (50, 50)
cropped.cropbox.upper_right = (550, 750)
cropped[NameObject("/UserUnit")] = NumberObject(2)
with (ROOT / "geometry.pdf").open("wb") as output:
    writer.write(output)

# Image-only content: there must be no accidental text operator or OCR layer.
picture = Image.new("RGB", (500, 160), "white")
drawing = ImageDraw.Draw(picture)
drawing.text((20, 20), "CH 1 KICK / CH 2 SNARE", fill="black")
c = canvas.Canvas(str(ROOT / "scan.pdf"), pagesize=A4, invariant=1)
c.drawImage(ImageReader(picture), 48, 600, width=500, height=160)
c.save()

encryption = StandardEncryption("test-password", ownerPassword="fixture-owner", canPrint=1)
c = canvas.Canvas(str(ROOT / "password.pdf"), pagesize=A4, invariant=1, encrypt=encryption)
c.drawString(48, 760, "1 Kick In")
c.save()

c = canvas.Canvas(str(ROOT / "too-many-pages.pdf"), pagesize=A4, invariant=1)
for number in range(101):
    c.drawString(48, 760, f"CH {number + 1}")
    c.showPage()
c.save()
print("Created five deterministic PDF reader fixtures.")
