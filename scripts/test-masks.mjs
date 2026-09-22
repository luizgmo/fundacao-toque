import { maskCPF, maskPhone, maskRG, maskCID, maskDate, unmask } from '../src/lib/masks.ts'

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    console.error(`❌ FALHA: ${message} | Esperado: "${expected}", Obtido: "${actual}"`)
    process.exit(1)
  } else {
    console.log(`✅ SUCESSO: ${message}`)
  }
}

console.log('--- Testando Máscaras de Entrada ---')

// Teste CPF
assertEqual(maskCPF('12345678901'), '123.456.789-01', 'Máscara de CPF completo')
assertEqual(maskCPF('123'), '123', 'Máscara de CPF parcial curto')
assertEqual(maskCPF('123456'), '123.456', 'Máscara de CPF parcial médio')
assertEqual(unmask('123.456.789-01'), '12345678901', 'Unmask remove pontuação')

// Teste Telefone
assertEqual(maskPhone('16999998888'), '(16) 99999-8888', 'Máscara celular 11 dígitos')
assertEqual(maskPhone('1633334444'), '(16) 3333-4444', 'Máscara telefone fixo 10 dígitos')

// Teste RG
assertEqual(maskRG('12345678X'), '12.345.678-X', 'Máscara RG com dígito X')
assertEqual(maskRG('123456789'), '12.345.678-9', 'Máscara RG com 9 dígitos')

// Teste CID
assertEqual(maskCID('f71'), 'F71', 'Máscara CID caixa alta')
assertEqual(maskCID('f84.0'), 'F84.0', 'Máscara CID com subcategoria')

// Teste Data
assertEqual(maskDate('15032008'), '15/03/2008', 'Máscara Data DD/MM/AAAA')

console.log('\n🎉 Todos os testes de máscaras passaram com 100% de sucesso!')
