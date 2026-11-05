'use client'
import jsPDF from 'jspdf'

interface ScheduleItem {
  id: string
  scheduleDay: string
  scheduleTime: string
  room?: string | null
  mataKuliah: { name: string; code: string; sks: number }
  kelas: { name: string }
  dosen: { name: string }
}

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

export function generateSchedulePDF(
  schedule: ScheduleItem[],
  userInfo: { name: string; nim?: string | null; kelas?: string }
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - margin * 2

  // Header - green theme
  doc.setFillColor(34, 139, 99) // emerald
  doc.rect(0, 0, pageWidth, 25, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('JADWAL MATA KULIAH', margin, 12)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('LMS Ujian Online - Sistem Manajemen Pembelajaran', margin, 18)
  doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, pageWidth - margin, 18, { align: 'right' })

  // User info
  let y = 35
  doc.setTextColor(40, 40, 40)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(userInfo.name, margin, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  if (userInfo.nim) {
    doc.text(`NIM: ${userInfo.nim}`, margin, y)
    y += 5
  }
  if (userInfo.kelas) {
    doc.text(`Kelas: ${userInfo.kelas}`, margin, y)
    y += 5
  }

  y += 5
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  // Group by day
  const byDay: Record<string, ScheduleItem[]> = {}
  schedule.forEach((s) => {
    if (!byDay[s.scheduleDay]) byDay[s.scheduleDay] = []
    byDay[s.scheduleDay].push(s)
  })
  Object.keys(byDay).forEach((day) => {
    byDay[day].sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime))
  })

  // Render each day
  for (const day of DAYS) {
    const items = byDay[day]
    if (!items || items.length === 0) continue

    // Check page break
    if (y > pageHeight - 30) {
      doc.addPage()
      y = 20
    }

    // Day header
    doc.setFillColor(236, 253, 245) // emerald-50
    doc.rect(margin, y - 4, contentWidth, 8, 'F')
    doc.setTextColor(6, 95, 70) // emerald-800
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(day.toUpperCase(), margin + 2, y + 1)
    y += 8

    // Table header
    doc.setTextColor(80, 80, 80)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    const cols = {
      time: { x: margin, w: 25 },
      mk: { x: margin + 27, w: 70 },
      sks: { x: margin + 99, w: 12 },
      kelas: { x: margin + 113, w: 25 },
      room: { x: margin + 140, w: 30 },
      dosen: { x: margin + 172, w: 23 },
    }
    doc.text('Waktu', cols.time.x, y)
    doc.text('Mata Kuliah', cols.mk.x, y)
    doc.text('SKS', cols.sks.x, y)
    doc.text('Kelas', cols.kelas.x, y)
    doc.text('Ruang', cols.room.x, y)
    doc.text('Dosen', cols.dosen.x, y)
    y += 3
    doc.setDrawColor(180, 180, 180)
    doc.line(margin, y, pageWidth - margin, y)
    y += 4

    // Items
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(40, 40, 40)
    for (const item of items) {
      if (y > pageHeight - 15) {
        doc.addPage()
        y = 20
      }
      doc.setFontSize(9)
      doc.text(item.scheduleTime, cols.time.x, y)
      // Truncate mata kuliah name if too long
      const mkText = `${item?.mataKuliah?.code || ''} - ${item?.mataKuliah?.name || ''}`
      const truncatedMK = doc.splitTextToSize(mkText, cols.mk.w)[0]
      doc.text(truncatedMK, cols.mk.x, y)
      doc.text(String(item?.mataKuliah?.sks || 0), cols.sks.x, y)
      doc.text(item?.kelas?.name || '-', cols.kelas.x, y)
      doc.text(item?.room || '-', cols.room.x, y)
      const dosenText = doc.splitTextToSize(item?.dosen?.name || '-', cols.dosen.w)[0]
      doc.text(dosenText, cols.dosen.x, y)
      y += 5
    }
    y += 4
  }

  // Footer on each page
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      `LMS Ujian Online - Halaman ${i} dari ${pageCount}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    )
  }

  // Save
  const filename = `Jadwal_${userInfo.nim || userInfo.name}_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)
}
