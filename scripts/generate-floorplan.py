"""Writes the fictional drawing A-104 for the example lab. Scale: 1 m = 50 units."""
import pathlib

S = 50
rooms = [
    ("RM-101", "AUTOMATION BAY", 0, 0, 13, 8), ("RM-102", "PREP LAB", 13, 0, 7, 5),
    ("RM-103", "IMAGING ROOM", 13, 5, 7, 3), ("RM-104", "COLD ROOM", 20, 0, 4, 4),
    ("RM-105", "CONSUMABLES STORE", 20, 4, 4, 4), ("RM-106", "SERVICE CORRIDOR", 0, 8, 24, 2.5),
    ("RM-107", "WRITE-UP OFFICE", 0, 10.5, 9, 3.5),
]
doors = [
    ("D-1", 6, 8, 1400, "RM-101", "RM-106"), ("D-2", 13, 2.5, 1000, "RM-101", "RM-102"),
    ("D-3", 13, 6.5, 850, "RM-101", "RM-103"), ("D-4", 16.5, 8, 1000, "RM-103", "RM-106"),
    ("D-5", 20, 2, 1000, "RM-102", "RM-104"), ("D-6", 22, 8, 1000, "RM-105", "RM-106"),
    ("D-7", 4, 10.5, 900, "RM-106", "RM-107"),
]
kit = [
    ("HOT-01", 1.5, 1.5, 1.2, 0.8), ("LH-01", 3.8, 1.5, 1.8, 1.0), ("DSP-01", 6.2, 1.5, 0.9, 0.7),
    ("SEAL-01", 8.0, 1.5, 0.6, 0.6), ("PEEL-01", 9.6, 1.5, 0.6, 0.6), ("INC-01", 3.2, 6.4, 1.5, 1.2),
    ("CFG-01", 5.8, 6.4, 0.9, 0.9), ("RDR-01", 8.0, 6.4, 0.9, 0.8), ("RDR-02", 10.0, 6.4, 0.9, 0.8),
    ("NEST-01", 11.9, 4.0, 0.5, 0.5), ("IMG-01", 17.0, 6.5, 1.6, 1.1), ("TC-01", 15.0, 1.5, 0.6, 0.7),
    ("TC-02", 16.8, 1.5, 0.6, 0.7), ("FRZ-01", 22.2, 1.8, 1.8, 1.2),
]
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -40 {24*S+40} {14*S+70}" font-family="monospace">',
       '<title>Drawing A-104 Rev C, Bay 4 general arrangement, scale 1:50, 1 m = 50 units</title>',
       f'<rect x="-20" y="-40" width="{24*S+40}" height="{14*S+70}" fill="#f4f1e8"/>',
       '<text x="0" y="-16" font-size="16" fill="#222">A-104 REV C / BAY 4 GENERAL ARRANGEMENT / 1:50</text>']
for rid, name, x, y, w, h in rooms:
    out.append(f'<rect id="{rid}" x="{x*S}" y="{y*S}" width="{w*S}" height="{h*S}" fill="none" stroke="#222" stroke-width="3"/>')
    out.append(f'<text x="{x*S+8}" y="{y*S+18}" font-size="13" fill="#222">{rid} {name}</text>')
out.append(f'<line id="RAIL-ARM-01" x1="{1.5*S}" y1="{4*S}" x2="{11*S}" y2="{4*S}" stroke="#222" stroke-width="2" stroke-dasharray="10 5"/>')
out.append(f'<text x="{4.5*S}" y="{4*S-8}" font-size="12" fill="#222">ARM-01 RAIL 9.5 m</text>')
for tag, x, y, w, d in kit:
    out.append(f'<rect id="{tag}" x="{(x-w/2)*S}" y="{(y-d/2)*S}" width="{w*S}" height="{d*S}" fill="#fff" stroke="#222"/>')
    out.append(f'<text x="{(x-w/2)*S+3}" y="{(y+d/2)*S+13}" font-size="11" fill="#222">{tag}</text>')
for tag, x, y, width, a, b in doors:
    out.append(f'<circle id="{tag}" cx="{x*S}" cy="{y*S}" r="7" fill="#f4f1e8" stroke="#b33" stroke-width="2"/>')
    out.append(f'<text x="{x*S+10}" y="{y*S-8}" font-size="11" fill="#b33">{tag} {width} CLR ({a}/{b})</text>')
out.append('</svg>')
path = pathlib.Path("examples/aldermoor-bay-4/evidence/floorplan.svg")
path.write_text("\n".join(out) + "\n")
