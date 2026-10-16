/**
 * 测试答题数据加载的简单脚本
 * 在浏览器控制台中运行以验证数据加载
 */

import {
  findAnswer,
  getQuestionCount,
  loadQuestionsData,
} from "./studyQuestionsFromJSON.js";

// 测试函数
export async function testQuestionLoading() {
  console.log("🧪 开始测试答题数据加载...");

  try {
    // 测试数据加载
    const questions = await loadQuestionsData();
    console.log(`✅ 成功加载题目数据，共 ${questions.length} 道题`);

    // 显示前5道题
    console.log("📋 前5道题目示例:");
    for (let i = 0; i < Math.min(5, questions.length); i++) {
      const q = questions[i];
      console.log(`${i + 1}. ${q.name} -> 答案: ${q.value}`);
    }

    // 测试查找功能
    console.log("\n🔍 测试答案查找功能:");

    const testQuestions = [
      "《三国演义》中，「大意失街亭」的是马谩？",
      "刘备三顾茅庐请诸葛亮出山",
      "中国最长的河流是",
      "不存在的题目测试",
    ];

    for (const testQ of testQuestions) {
      const answer = await findAnswer(testQ);
      console.log(`题目: "${testQ}" -> 答案: ${answer || "未找到"}`);
    }

    // 测试题目数量
    const count = await getQuestionCount();
    console.log(`\n📊 题目总数: ${count}`);

    console.log("🎉 测试完成！");
    return true;
  } catch (error) {
    console.error("❌ 测试失败:", error);
    return false;
  }
}

// 如果直接运行这个文件
if (typeof window !== "undefined") {
  // 浏览器环境，将测试函数挂载到 window 对象
  window.testStudyQuestions = testQuestionLoading;
  console.log("🛠️ 测试函数已挂载到 window.testStudyQuestions，可在控制台运行");
}
