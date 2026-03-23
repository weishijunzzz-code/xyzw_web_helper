import { ref } from 'vue'
import * as XLSX from 'xlsx'

/**
 * 数据导出组合式函数
 */
export function useDataExport() {
  const isExporting = ref(false)

  /**
   * 导出为 Excel
   */
  const exportToExcel = (data, filename = 'export.xlsx', options = {}) => {
    try {
      isExporting.value = true
      
      const {
        sheetName = 'Sheet1',
        columns = null // 指定列 [{ key: 'name', title: '姓名' }]
      } = options

      let exportData = data

      // 如果指定了列，按列顺序导出
      if (columns) {
        exportData = data.map(item => {
          const row = {}
          columns.forEach(col => {
            row[col.title] = item[col.key]
          })
          return row
        })
      }

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      
      XLSX.writeFile(wb, filename)
      
      return true
    } catch (error) {
      console.error('导出 Excel 失败:', error)
      return false
    } finally {
      isExporting.value = false
    }
  }

  /**
   * 导出为 JSON
   */
  const exportToJSON = (data, filename = 'export.json') => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      URL.revokeObjectURL(url)
      return true
    } catch (error) {
      console.error('导出 JSON 失败:', error)
      return false
    }
  }

  /**
   * 导出为 CSV
   */
  const exportToCSV = (data, filename = 'export.csv') => {
    try {
      const headers = Object.keys(data[0] || {})
      const csvContent = [
        headers.join(','),
        ...data.map(row => 
          headers.map(header => {
            const value = row[header]
            // 处理包含逗号或引号的值
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`
            }
            return value
          }).join(',')
        )
      ].join('\n')

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      URL.revokeObjectURL(url)
      return true
    } catch (error) {
      console.error('导出 CSV 失败:', error)
      return false
    }
  }

  return {
    isExporting,
    exportToExcel,
    exportToJSON,
    exportToCSV
  }
}

/**
 * 数据导入组合式函数
 */
export function useDataImport() {
  const isImporting = ref(false)
  const importError = ref(null)

  /**
   * 从 Excel 导入
   */
  const importFromExcel = (file) => {
    return new Promise((resolve, reject) => {
      try {
        isImporting.value = true
        importError.value = null

        const reader = new FileReader()
        
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target.result)
            const workbook = XLSX.read(data, { type: 'array' })
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
            const jsonData = XLSX.utils.sheet_to_json(firstSheet)
            
            resolve(jsonData)
          } catch (error) {
            importError.value = error.message
            reject(error)
          } finally {
            isImporting.value = false
          }
        }

        reader.onerror = (error) => {
          importError.value = error.message
          isImporting.value = false
          reject(error)
        }

        reader.readAsArrayBuffer(file)
      } catch (error) {
        importError.value = error.message
        isImporting.value = false
        reject(error)
      }
    })
  }

  /**
   * 从 JSON 导入
   */
  const importFromJSON = (file) => {
    return new Promise((resolve, reject) => {
      try {
        isImporting.value = true
        importError.value = null

        const reader = new FileReader()
        
        reader.onload = (e) => {
          try {
            const jsonData = JSON.parse(e.target.result)
            resolve(jsonData)
          } catch (error) {
            importError.value = '无效的 JSON 文件'
            reject(error)
          } finally {
            isImporting.value = false
          }
        }

        reader.onerror = (error) => {
          importError.value = error.message
          isImporting.value = false
          reject(error)
        }

        reader.readAsText(file)
      } catch (error) {
        importError.value = error.message
        isImporting.value = false
        reject(error)
      }
    })
  }

  return {
    isImporting,
    importError,
    importFromExcel,
    importFromJSON
  }
}
