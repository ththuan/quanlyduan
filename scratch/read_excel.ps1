$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('d:\QLDA\TONG HOP DU AN.xlsx')

Write-Host "=== Sheet Names ==="
foreach($ws in $wb.Worksheets) {
    Write-Host $ws.Name
}

Write-Host ""

foreach($ws in $wb.Worksheets) {
    Write-Host "=== Sheet: $($ws.Name) ==="
    Write-Host ""
    $usedRange = $ws.UsedRange
    $rows = $usedRange.Rows.Count
    $cols = $usedRange.Columns.Count
    Write-Host "Rows: $rows, Cols: $cols"
    
    for($r = 1; $r -le [Math]::Min($rows, 100); $r++) {
        $line = ""
        for($c = 1; $c -le $cols; $c++) {
            $val = $ws.Cells.Item($r, $c).Text
            if($c -gt 1) { $line += "`t" }
            $line += $val
        }
        Write-Host $line
    }
    Write-Host ""
}

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
